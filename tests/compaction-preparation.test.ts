import test from "node:test";
import assert from "node:assert/strict";
import {
	NO_PRE_COMPACTION_MESSAGES_KEPT_ENTRY_ID,
	normalizeCompactionPreparation,
	stripCompactionPreparationMessages,
	type ContinuationCompactionPreparation,
} from "../extensions/continue/src/compaction-preparation.ts";

function emptyFileOps() {
	return {
		read: new Set<string>(),
		written: new Set<string>(),
		edited: new Set<string>(),
	};
}

function noOpPreparation(overrides = {}): ContinuationCompactionPreparation {
	return {
		firstKeptEntryId: "model",
		messagesToSummarize: [],
		turnPrefixMessages: [],
		isSplitTurn: false,
		tokensBefore: 219900,
		previousSummary: undefined,
		fileOps: emptyFileOps(),
		settings: { enabled: true, reserveTokens: 68000, keepRecentTokens: 20000 },
		...overrides,
	};
}

function messageEntry(id: string, parentId: string, role: string, content: unknown[] = []) {
	return {
		type: "message",
		id,
		parentId,
		timestamp: "2026-04-26T13:00:00.000Z",
		message: {
			role,
			content,
			timestamp: 1777208400000,
		},
	};
}

function toolResultEntry(id: string, parentId: string, toolCallId: string, toolName: string, content: unknown[] = []) {
	return {
		type: "message",
		id,
		parentId,
		timestamp: "2026-04-26T13:00:00.000Z",
		message: {
			role: "toolResult",
			toolCallId,
			toolName,
			content,
			isError: false,
			timestamp: 1777208400000,
		},
	};
}

function textBlock(text: string) {
	return { type: "text", text };
}

function toolCallBlock(id: string, name: string, args: Record<string, unknown>) {
	return { type: "toolCall", id, name, arguments: args };
}

function roleOf(message: unknown): string | undefined {
	if (typeof message !== "object" || message === null || !("role" in message)) return undefined;
	const role = message.role;
	return typeof role === "string" ? role : undefined;
}

function keptRolesFrom(branchEntries: unknown[], firstKeptEntryId: string): string[] {
	const startIndex = branchEntries.findIndex((entry) => {
		return typeof entry === "object" && entry !== null && "id" in entry && entry.id === firstKeptEntryId;
	});
	if (startIndex < 0) return [];
	return branchEntries.slice(startIndex).map((entry) => {
		if (typeof entry !== "object" || entry === null || !("message" in entry)) return undefined;
		return roleOf(entry.message);
	}).filter((role): role is string => role !== undefined);
}

test("normalizeCompactionPreparation repairs Pi no-op cuts at completed tool-result suffixes", () => {
	const branchEntries = [
		{ type: "model_change", id: "model", parentId: null, provider: "openai-codex", modelId: "gpt-5.5" },
		{ type: "thinking_level_change", id: "think", parentId: "model", thinkingLevel: "xhigh" },
		messageEntry("u1", "think", "user", [textBlock("initial task")]),
		messageEntry("a1", "u1", "assistant", [toolCallBlock("call-old", "read", { path: "/repo/old.ts" })]),
		toolResultEntry("tr1", "a1", "call-old", "read", [textBlock("old file")]),
		messageEntry("u2", "tr1", "user", [textBlock("correction before official docs")]),
		messageEntry("a2", "u2", "assistant", [
			toolCallBlock("call-search-1", "exa_search", { query: "official docs" }),
			toolCallBlock("call-search-2", "exa_search", { query: "package docs" }),
		]),
		toolResultEntry("tr2", "a2", "call-search-1", "exa_search", [textBlock("search result 1")]),
		toolResultEntry("tr3", "tr2", "call-search-2", "exa_search", [textBlock("search result 2")]),
	];

	const normalized = normalizeCompactionPreparation(noOpPreparation(), branchEntries);

	assert.equal(normalized.repairedNoOpCut, true);
	assert.equal(normalized.repairedProviderUnsafeSuffix, false);
	assert.equal(normalized.firstKeptEntryId, "a2");
	assert.equal(normalized.isSplitTurn, true);
	assert.deepEqual(normalized.messagesToSummarize.map(roleOf), ["user", "assistant", "toolResult"]);
	assert.deepEqual(normalized.turnPrefixMessages.map(roleOf), ["user"]);
	assert.deepEqual(keptRolesFrom(branchEntries, normalized.firstKeptEntryId), ["assistant", "toolResult", "toolResult"]);
	assert.deepEqual([...normalized.fileOps.read], ["/repo/old.ts"]);
});

test("normalizeCompactionPreparation leaves non-empty Pi preparations untouched", () => {
	const branchEntries = [
		messageEntry("u1", "model", "user", [textBlock("task")]),
		messageEntry("a1", "u1", "assistant", [toolCallBlock("call-read", "read", { path: "/repo/file.ts" })]),
		toolResultEntry("tr1", "a1", "call-read", "read", [textBlock("file")]),
	];
	const originalMessage = { role: "user", content: [textBlock("already prepared")] };
	const preparation = noOpPreparation({
		firstKeptEntryId: "a1",
		messagesToSummarize: [originalMessage],
	});

	const normalized = normalizeCompactionPreparation(preparation, branchEntries);

	assert.equal(normalized.repairedNoOpCut, false);
	assert.equal(normalized.repairedProviderUnsafeSuffix, false);
	assert.equal(normalized.firstKeptEntryId, "a1");
	assert.deepEqual(normalized.messagesToSummarize, [originalMessage]);
});

test("normalizeCompactionPreparation leaves branches without a completed tool batch untouched", () => {
	const branchEntries = [
		messageEntry("u1", "model", "user", [textBlock("task")]),
		messageEntry("a1", "u1", "assistant", [textBlock("final answer")]),
	];

	const normalized = normalizeCompactionPreparation(noOpPreparation(), branchEntries);

	assert.equal(normalized.repairedNoOpCut, false);
	assert.equal(normalized.repairedProviderUnsafeSuffix, false);
	assert.equal(normalized.firstKeptEntryId, "model");
});

test("normalizeCompactionPreparation summarizes provider-unsafe kept suffixes when no safe suffix remains", () => {
	const branchEntries = [
		{ type: "model_change", id: "model", parentId: null, provider: "openai-codex", modelId: "gpt-5.5" },
		messageEntry("u1", "model", "user", [textBlock("investigate")]),
		messageEntry("a1", "u1", "assistant", [toolCallBlock("call-a", "read", { path: "/repo/a.ts" })]),
		toolResultEntry("tr1", "a1", "call-a", "read", [textBlock("a")]),
		messageEntry("a2", "tr1", "assistant", [toolCallBlock("call-b", "read", { path: "/repo/b.ts" })]),
		toolResultEntry("tr2", "a2", "call-b", "read", [textBlock("b")]),
		toolResultEntry("orphan", "tr2", "call-orphan", "agent_team", [textBlock("late child output")]),
	];

	const normalized = normalizeCompactionPreparation(noOpPreparation({ firstKeptEntryId: "a1" }), branchEntries);

	assert.equal(normalized.repairedProviderUnsafeSuffix, true);
	assert.equal(normalized.repairedNoOpCut, false);
	assert.equal(normalized.firstKeptEntryId, NO_PRE_COMPACTION_MESSAGES_KEPT_ENTRY_ID);
	assert.equal(normalized.isSplitTurn, false);
	assert.deepEqual(normalized.messagesToSummarize.map(roleOf), ["user", "assistant", "toolResult", "assistant", "toolResult", "toolResult"]);
	assert.deepEqual(normalized.turnPrefixMessages, []);
	assert.deepEqual(keptRolesFrom(branchEntries, normalized.firstKeptEntryId), []);
	assert.deepEqual([...normalized.fileOps.read].sort(), ["/repo/a.ts", "/repo/b.ts"]);
});

test("normalizeCompactionPreparation moves past provider-unsafe tool results when a later safe suffix exists", () => {
	const branchEntries = [
		{ type: "model_change", id: "model", parentId: null, provider: "openai-codex", modelId: "gpt-5.5" },
		messageEntry("u1", "model", "user", [textBlock("investigate")]),
		messageEntry("a1", "u1", "assistant", [toolCallBlock("call-a", "read", { path: "/repo/a.ts" })]),
		toolResultEntry("tr1", "a1", "call-a", "read", [textBlock("a")]),
		toolResultEntry("orphan", "tr1", "call-orphan", "agent_team", [textBlock("late child output")]),
		messageEntry("u2", "orphan", "user", [textBlock("continue after child output")]),
		messageEntry("a2", "u2", "assistant", [toolCallBlock("call-b", "read", { path: "/repo/b.ts" })]),
		{ ...toolResultEntry("tr2", "a2", "call-b", "read", [textBlock("b")]), message: { role: "toolResult", toolCallId: "call-b", toolName: "read", content: [textBlock("b")], isError: true, timestamp: 1777208400000 } },
	];

	const normalized = normalizeCompactionPreparation(noOpPreparation({ firstKeptEntryId: "a1" }), branchEntries);

	assert.equal(normalized.repairedProviderUnsafeSuffix, true);
	assert.equal(normalized.firstKeptEntryId, "u2");
	assert.equal(normalized.isSplitTurn, false);
	assert.deepEqual(normalized.messagesToSummarize.map(roleOf), ["user", "assistant", "toolResult", "toolResult"]);
	assert.deepEqual(normalized.turnPrefixMessages, []);
	assert.deepEqual(keptRolesFrom(branchEntries, normalized.firstKeptEntryId), ["user", "assistant", "toolResult"]);
	assert.deepEqual([...normalized.fileOps.read].sort(), ["/repo/a.ts"]);
});

test("stripCompactionPreparationMessages removes injected resume prompts after safety normalization", () => {
	const injectedResumePrompt = { role: "user", content: [textBlock("Continue from pi-continue handoff")], timestamp: 1777208400000 };
	const branchEntries = [
		{ type: "model_change", id: "model", parentId: null, provider: "openai-codex", modelId: "gpt-5.5" },
		{ type: "message", id: "injected", parentId: "model", timestamp: "2026-04-26T13:00:00.000Z", message: injectedResumePrompt },
		messageEntry("a1", "injected", "assistant", [toolCallBlock("call-a", "read", { path: "/repo/a.ts" })]),
		toolResultEntry("tr1", "a1", "call-a", "read", [textBlock("a")]),
		toolResultEntry("orphan", "tr1", "call-orphan", "agent_team", [textBlock("late child output")]),
	];

	const normalized = normalizeCompactionPreparation(noOpPreparation({ firstKeptEntryId: "a1" }), branchEntries);
	const stripped = stripCompactionPreparationMessages(normalized, (message) => message === injectedResumePrompt);

	assert.equal(stripped.repairedProviderUnsafeSuffix, true);
	assert.equal(stripped.firstKeptEntryId, NO_PRE_COMPACTION_MESSAGES_KEPT_ENTRY_ID);
	assert.deepEqual(stripped.messagesToSummarize.map(roleOf), ["assistant", "toolResult", "toolResult"]);
	assert.deepEqual(stripped.turnPrefixMessages, []);
	assert.deepEqual([...stripped.fileOps.read], ["/repo/a.ts"]);
});

test("normalizeCompactionPreparation pulls the owning assistant back in when Pi cuts at a tool result", () => {
	const branchEntries = [
		{ type: "model_change", id: "model", parentId: null, provider: "openai-codex", modelId: "gpt-5.5" },
		messageEntry("u1", "model", "user", [textBlock("inspect")]),
		messageEntry("a1", "u1", "assistant", [
			toolCallBlock("call-a", "read", { path: "/repo/a.ts" }),
			toolCallBlock("call-b", "read", { path: "/repo/b.ts" }),
		]),
		toolResultEntry("tr1", "a1", "call-a", "read", [textBlock("a")]),
		toolResultEntry("tr2", "tr1", "call-b", "read", [textBlock("b")]),
	];

	const normalized = normalizeCompactionPreparation(noOpPreparation({ firstKeptEntryId: "tr1" }), branchEntries);

	assert.equal(normalized.repairedProviderUnsafeSuffix, true);
	assert.equal(normalized.firstKeptEntryId, "a1");
	assert.equal(normalized.isSplitTurn, true);
	assert.deepEqual(normalized.messagesToSummarize, []);
	assert.deepEqual(normalized.turnPrefixMessages.map(roleOf), ["user"]);
	assert.deepEqual(keptRolesFrom(branchEntries, normalized.firstKeptEntryId), ["assistant", "toolResult", "toolResult"]);
});
