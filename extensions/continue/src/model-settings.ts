import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ContinuationConfig, HistoryOutputBudget } from "./types.ts";

/** Resolve the effective summarizer model from config or the current session model. */
export function resolveSummarizerModel(
	ctx: ExtensionContext,
	config: ContinuationConfig,
): Model<Api> | undefined {
	if (config.summarizerModel === "inherit") return ctx.model;
	const slashIndex = config.summarizerModel.indexOf("/");
	if (slashIndex <= 0 || slashIndex === config.summarizerModel.length - 1) return undefined;
	const provider = config.summarizerModel.slice(0, slashIndex);
	const modelId = config.summarizerModel.slice(slashIndex + 1);
	return ctx.modelRegistry.find(provider, modelId);
}

function positiveFiniteInteger(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
	return Math.floor(value);
}

/** Match Pi native compaction's history budget formula and clamp to the model max-output cap when known. */
export function resolveHistoryOutputBudget(
	model: Pick<Model<Api>, "maxTokens"> | undefined,
	reserveTokens: number,
	override: number | null,
): HistoryOutputBudget {
	const requestedTokens = override ?? Math.floor(0.8 * reserveTokens);
	const modelMaxTokens = positiveFiniteInteger(model?.maxTokens);
	const effectiveTokens = modelMaxTokens === undefined ? requestedTokens : Math.min(requestedTokens, modelMaxTokens);
	return {
		source: override === null ? "pi-default" : "config",
		requestedTokens,
		effectiveTokens,
		modelMaxTokens,
		clampedByModel: effectiveTokens !== requestedTokens,
	};
}
