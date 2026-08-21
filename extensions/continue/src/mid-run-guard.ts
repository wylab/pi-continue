import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadContinuationConfig } from "./config.ts";
import { normalizeCompactionPreparation, type ContinuationCompactionPreparation } from "./compaction-preparation.ts";
import { readEffectivePiCompactionSettings } from "./pi-settings.ts";
import { loadPiInternals } from "./pi-internals.ts";
import { resolveProjectContext } from "./project.ts";
import { sendContinuationPrompt } from "./prompt-dispatch.ts";
import { startContinuationCompaction, type ContinuationRuntimeState } from "./runtime.ts";
import { endsWithCompleteToolResultBatch } from "./tool-batches.ts";
import type {
	ContextUsageEstimateSnapshot,
	ContinuationAdoptionCheckpoint,
	ContinuationConfig,
	MidRunGuardTrigger,
	PiCompactionSettings,
} from "./types.ts";

export interface MidRunGuardDecisionInput {
	config: ContinuationConfig;
	piSettings: PiCompactionSettings;
	contextWindow: number | undefined;
	estimate: ContextUsageEstimateSnapshot;
}

interface BranchEntryRecord {
	type?: unknown;
	message?: unknown;
	customType?: unknown;
	content?: unknown;
	display?: unknown;
	details?: unknown;
	timestamp?: unknown;
	summary?: unknown;
	fromId?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function hasUsableContextWindow(contextWindow: number | undefined, reserveTokens: number): contextWindow is number {
	return contextWindow !== undefined && Number.isFinite(contextWindow) && contextWindow > reserveTokens;
}

function buildNoCompactableGuardKey(trigger: MidRunGuardTrigger, piSettings: PiCompactionSettings): string {
	return [
		trigger.contextWindow,
		trigger.reserveTokens,
		trigger.thresholdTokens,
		piSettings.keepRecentTokens,
	].join(":");
}

function notifyNoCompactableSession(
	ctx: ExtensionContext,
	runtime: ContinuationRuntimeState,
	trigger: MidRunGuardTrigger,
	piSettings: PiCompactionSettings,
): void {
	const key = buildNoCompactableGuardKey(trigger, piSettings);
	if (runtime.lastNoCompactableGuardKey === key) return;
	runtime.lastNoCompactableGuardKey = key;
	if (!ctx.hasUI) return;
	ctx.ui.notify(
		"automatic continuation skipped: Pi has no compactable session history yet; the over-threshold context is still within the recent keep window or static prompt overhead.",
		"warning",
	);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function hasFileOperationSets(value: unknown): boolean {
	if (!isRecord(value)) return false;
	return value.read instanceof Set && value.written instanceof Set && value.edited instanceof Set;
}

function isPiCompactionSettings(value: unknown): value is PiCompactionSettings {
	if (!isRecord(value)) return false;
	return typeof value.enabled === "boolean"
		&& isFiniteNumber(value.reserveTokens)
		&& isFiniteNumber(value.keepRecentTokens);
}

function isContinuationCompactionPreparation(value: unknown): value is ContinuationCompactionPreparation {
	if (!isRecord(value)) return false;
	return typeof value.firstKeptEntryId === "string"
		&& Array.isArray(value.messagesToSummarize)
		&& Array.isArray(value.turnPrefixMessages)
		&& typeof value.isSplitTurn === "boolean"
		&& isFiniteNumber(value.tokensBefore)
		&& hasFileOperationSets(value.fileOps)
		&& isPiCompactionSettings(value.settings);
}

function messageFromBranchEntry(entry: unknown): unknown | undefined {
	if (!isRecord(entry)) return undefined;
	const record = entry as BranchEntryRecord;
	if (record.type === "message") return record.message;
	if (record.type === "custom_message") {
		return {
			role: "custom",
			customType: record.customType,
			content: record.content,
			display: record.display,
			details: record.details,
			timestamp: record.timestamp,
		};
	}
	if (record.type === "branch_summary" && typeof record.summary === "string" && typeof record.fromId === "string") {
		return {
			role: "branchSummary",
			summary: record.summary,
			fromId: record.fromId,
			timestamp: record.timestamp,
		};
	}
	return undefined;
}

function estimateBranchTokens(branchEntries: unknown[], estimateTokens: (message: unknown) => number): number {
	let total = 0;
	for (const entry of branchEntries) {
		const message = messageFromBranchEntry(entry);
		if (!message) continue;
		const tokens = estimateTokens(message);
		if (Number.isFinite(tokens) && tokens > 0) total += tokens;
	}
	return total;
}

export function hasNativeCompactionPreparation(
	preparation: unknown | undefined,
	branchEntries: unknown[],
	piSettings: PiCompactionSettings,
	estimateTokens: (message: unknown) => number,
): boolean {
	if (!isContinuationCompactionPreparation(preparation)) return false;
	if (preparation.messagesToSummarize.length > 0) return true;
	if (preparation.turnPrefixMessages.length > 0) return true;
	if (estimateBranchTokens(branchEntries, estimateTokens) <= piSettings.keepRecentTokens) return false;
	const normalized = normalizeCompactionPreparation(preparation, branchEntries);
	return normalized.messagesToSummarize.length > 0 || normalized.turnPrefixMessages.length > 0;
}

/** Decide whether a pre-provider context belongs to a completed assistant/tool-result loop. */
export function shouldEvaluateMidRunContext(messages: unknown[]): boolean {
	return endsWithCompleteToolResultBatch(messages);
}

/** Decide whether the package must stop before Pi sends another provider request. */
export function decideMidRunGuardTrigger(input: MidRunGuardDecisionInput): MidRunGuardTrigger | undefined {
	if (!input.config.enabled || !input.config.midRunGuardEnabled || !input.piSettings.enabled) return undefined;
	if (!hasUsableContextWindow(input.contextWindow, input.piSettings.reserveTokens)) return undefined;
	const thresholdTokens = input.contextWindow - input.piSettings.reserveTokens;
	if (input.estimate.tokens <= thresholdTokens) return undefined;
	return {
		estimatedTokens: input.estimate.tokens,
		thresholdTokens,
		contextWindow: input.contextWindow,
		reserveTokens: input.piSettings.reserveTokens,
		usageTokens: input.estimate.usageTokens,
		trailingTokens: input.estimate.trailingTokens,
		lastUsageIndex: input.estimate.lastUsageIndex,
	};
}

/** Stop reasons that mean the assistant finished its own turn rather than erroring or being cancelled. */
const ADOPTABLE_STOP_REASONS = new Set<string>(["stop", "toolUse", "length"]);
/** Pi starts its threshold compaction inside the same agent_end processing as the checkpoint. */
export const ADOPTION_CHECKPOINT_MAX_AGE_MS = 5_000;

export interface AdoptedCompactionDecisionInput {
	config: ContinuationConfig;
	piCompactionEnabled: boolean;
	contextWindow: number | undefined;
	reserveTokens: number;
	tokensBefore: number;
	/** Single-use checkpoint already claimed by this compaction, if one was open. */
	checkpoint: ContinuationAdoptionCheckpoint | undefined;
	hasCustomInstructions: boolean;
	now: number;
}

/**
 * Decide whether a compaction Pi started on its own is the automatic
 * over-threshold checkpoint the package should own.
 *
 * Adoption requires the single-use checkpoint opened by an assistant turn that
 * ended on its own. New user input, a new turn, or an earlier compaction closes
 * that checkpoint, and custom instructions mark a deliberate `/compact`, so manual
 * compaction, compaction while input is submitted, cancelled turns, and
 * context-overflow recovery all keep Pi's native summarizer.
 */
export function decideAdoptedCompactionTrigger(input: AdoptedCompactionDecisionInput): MidRunGuardTrigger | undefined {
	if (!input.config.enabled || !input.config.adoptNativeCompaction) return undefined;
	if (!input.piCompactionEnabled || input.hasCustomInstructions) return undefined;
	if (!hasUsableContextWindow(input.contextWindow, input.reserveTokens)) return undefined;
	if (!isFiniteNumber(input.tokensBefore)) return undefined;
	const checkpoint = input.checkpoint;
	if (!checkpoint) return undefined;
	if (input.now - checkpoint.openedAt > ADOPTION_CHECKPOINT_MAX_AGE_MS) return undefined;
	if (checkpoint.stopReason === undefined || !ADOPTABLE_STOP_REASONS.has(checkpoint.stopReason)) return undefined;
	const thresholdTokens = input.contextWindow - input.reserveTokens;
	if (input.tokensBefore <= thresholdTokens) return undefined;
	return {
		estimatedTokens: input.tokensBefore,
		thresholdTokens,
		contextWindow: input.contextWindow,
		reserveTokens: input.reserveTokens,
		usageTokens: input.tokensBefore,
		trailingTokens: 0,
		lastUsageIndex: null,
	};
}

/** Evaluate the awaited pre-provider guard after a complete assistant/tool-result batch. */
export async function runMidRunGuard(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	runtime: ContinuationRuntimeState,
	messages: unknown[],
	onContinuationFailed?: (eventId: string) => void,
): Promise<void> {
	if (!shouldEvaluateMidRunContext(messages) || !ctx.model) return;
	const initialProjectContext = await resolveProjectContext(pi, ctx.cwd, ctx.sessionManager.getSessionId());
	const config = loadContinuationConfig(initialProjectContext.projectRoot);
	if (!config.enabled || !config.midRunGuardEnabled) return;
	const piSettings = readEffectivePiCompactionSettings(initialProjectContext.projectRoot);
	const internals = await loadPiInternals();
	const estimate = internals.estimateContextTokens(messages);
	const trigger = decideMidRunGuardTrigger({
		config,
		piSettings,
		contextWindow: ctx.model.contextWindow,
		estimate,
	});
	if (!trigger) return;
	const branchEntries = ctx.sessionManager.getBranch();
	const preparation = internals.prepareCompaction(branchEntries, piSettings);
	if (!hasNativeCompactionPreparation(preparation, branchEntries, piSettings, internals.estimateTokens)) {
		notifyNoCompactableSession(ctx, runtime, trigger, piSettings);
		return;
	}
	runtime.lastNoCompactableGuardKey = undefined;
	startContinuationCompaction(ctx, runtime, {
		source: "mid-run-guard",
		instructions: undefined,
		trigger,
		abortActiveRun: true,
		continueAfterComplete: true,
		sendContinuation: (prompt) => sendContinuationPrompt(pi, prompt),
		onContinuationFailed,
	});
}

/**
 * Absolute compaction policy (user ruling 2026-08-19): any session compacts at roughly
 * 120-150k tokens regardless of the active model's context window. Two enforcement legs:
 *
 * 1. Proactive trigger (enforceAbsoluteThresholdCompaction): fires before a turn when the
 *    session is at/above the policy band AND the band sits safely below the native ask point
 *    (window - reserve - margin). For windows too small to fit the band it stays off: the
 *    window-relative paths (mid-run guard / native threshold / overflow-retry) own compaction.
 * 2. Veto (decideAbsoluteThresholdVeto): cancels spurious native threshold compactions that
 *    fire early. It engages only when the threshold is INVERTED (reserve > window, so Pi asks
 *    every end-turn): each ask below the policy band is cancelled, and at/above the band the
 *    compaction is allowed - so the veto alone converts every-turn noise into policy
 *    compaction. Overflow (reason "overflow" / willRetry) is NEVER vetoed (hard rule).
 */

const ABSOLUTE_TRIGGER_WINDOW_MARGIN_TOKENS = 16_384;

export async function decideAbsoluteThresholdVeto(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	event: { reason?: unknown; willRetry?: unknown; preparation?: { tokensBefore?: number } | null },
): Promise<{ cancel: true } | undefined> {
	if (event.reason !== "threshold" || event.willRetry === true) return undefined;
	const tokensBefore = event.preparation?.tokensBefore;
	if (typeof tokensBefore !== "number" || !Number.isFinite(tokensBefore)) return undefined;
	const contextWindow = ctx.model?.contextWindow;
	if (contextWindow === undefined || !Number.isFinite(contextWindow)) return undefined;
	const projectContext = await resolveProjectContext(pi, ctx.cwd, ctx.sessionManager.getSessionId());
	const config = loadContinuationConfig(projectContext.projectRoot);
	const abs = config.absoluteCompactThresholdTokens;
	if (!config.enabled || abs === null || abs <= 0) return undefined;
	const piSettings = readEffectivePiCompactionSettings(projectContext.projectRoot);
	if (piSettings.reserveTokens <= contextWindow) return undefined;
	if (tokensBefore >= abs) return undefined;
	return { cancel: true };
}

export async function enforceAbsoluteThresholdCompaction(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	runtime: ContinuationRuntimeState,
	onContinuationFailed?: (eventId: string) => void,
): Promise<void> {
	const log = (level: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>) => {
		const payload = extra ? " " + Object.entries(extra).map(([k, v]) => `${k}=${String(v)}`).join(" ") : "";
		console.error(`[pi-continue/abs-threshold] ${level.toUpperCase()} ${msg}${payload}`);
	};
	if (!ctx.model) return log("info", "skip: no model", undefined);
	const contextWindow = ctx.model.contextWindow;
	if (contextWindow === undefined || !Number.isFinite(contextWindow)) return log("info", "skip: no context window", undefined);
	const projectContext = await resolveProjectContext(pi, ctx.cwd, ctx.sessionManager.getSessionId());
	const config = loadContinuationConfig(projectContext.projectRoot);
	const abs = config.absoluteCompactThresholdTokens;
	if (!config.enabled || abs === null || abs <= 0) return log("info", "skip: policy disabled", undefined);
	const piSettings = readEffectivePiCompactionSettings(projectContext.projectRoot);
	if (abs >= contextWindow - piSettings.reserveTokens - ABSOLUTE_TRIGGER_WINDOW_MARGIN_TOKENS) {
		return log("info", "skip: window cannot fit the band safely", { window: contextWindow, reserve: piSettings.reserveTokens, band: abs });
	}
	const internals = await loadPiInternals().catch((err) => {
		log("error", "skip: host internals unavailable", { error: String((err as Error)?.message ?? err) });
		return undefined;
	});
	if (!internals) return;
	// Primary context size: usage-based estimate over the live branch (the same
	// function Pi core uses). ctx.getContextUsage() is only a cross-check: in real
	// sessions it returns { tokens: null } whenever the latest compaction has no
	// trusted post-compaction assistant usage, which silently disabled this trigger
	// (2026-08-20 unraid-recoupler death — see ARA pi-continue-defect-chain).
	const branchMessages = ctx.sessionManager.getBranch().flatMap((entry) =>
		isRecord(entry) && entry.type === "message" && isRecord(entry.message) ? [entry.message] : [],
	);
	const estimate = internals.estimateContextTokens(branchMessages);
	const usage = ctx.getContextUsage();
	const usageTokens = typeof usage?.tokens === "number" ? usage.tokens : null;
	const tokens = estimate.tokens;
	if (tokens < abs) {
		return log("info", "skip: below band", { tokens, usageTokens, band: abs });
	}
	const branchEntries = ctx.sessionManager.getBranch();
	const preparation = internals.prepareCompaction(branchEntries, piSettings);
	if (!hasNativeCompactionPreparation(preparation, branchEntries, piSettings, internals.estimateTokens)) {
		return log("info", "skip: no native compaction preparation", { tokens, band: abs });
	}
	log("warn", "FIRE absolute-threshold compaction", {
		tokens,
		usageTokens,
		band: abs,
		window: contextWindow,
		reserve: piSettings.reserveTokens,
		nativeAskPoint: contextWindow - piSettings.reserveTokens,
	});
	startContinuationCompaction(ctx, runtime, {
		source: "absolute-threshold",
		instructions: undefined,
		trigger: {
			estimatedTokens: tokens,
			thresholdTokens: abs,
			contextWindow,
			reserveTokens: piSettings.reserveTokens,
			usageTokens: usageTokens ?? tokens,
			trailingTokens: estimate.trailingTokens,
			lastUsageIndex: estimate.lastUsageIndex,
		},
		abortActiveRun: false,
		continueAfterComplete: false,
		sendContinuation: (prompt) => sendContinuationPrompt(pi, prompt),
		onContinuationFailed,
	});
}
