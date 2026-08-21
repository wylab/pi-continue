import test from "node:test";
import assert from "node:assert/strict";
import { fauxAssistantMessage, registerFauxProvider } from "@earendil-works/pi-ai";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import registerContinueExtension from "../extensions/continue/index.ts";
import {
	LEDGER_ROW_CUSTOM_TYPE,
	LEDGER_ROW_SCHEMA,
	reduceLedgerRows,
} from "../extensions/continue/src/ledger-rows.ts";

// --- Minimal fakes, mirroring tests/index-extension.test.ts conventions ---

function createFakePi(cwd) {
	const commands = new Map();
	const events = new Map();
	const sent = [];
	const appendedEntries = [];
	let entrySeq = 0;
	return {
		commands,
		events,
		sent,
		appendedEntries,
		registerCommand(name, command) {
			commands.set(name, command);
		},
		on(name, handler) {
			events.set(name, handler);
		},
		sendUserMessage(prompt) {
			sent.push(prompt);
		},
		getThinkingLevel() {
			return undefined;
		},
		appendEntry(customType, data) {
			entrySeq += 1;
			appendedEntries.push({ id: `custom-${entrySeq}`, parentId: null, type: "custom", customType, data, timestamp: Date.now() });
		},
		async exec(command, args, options) {
			assert.equal(command, "git");
			assert.deepEqual(args, ["rev-parse", "--show-toplevel"]);
			return { stdout: options?.cwd ?? cwd, code: 0 };
		},
	};
}

function createCommandContext(cwd, custom) {
	let compactCount = 0;
	let branchEntries = [];
	const ctx = {
		cwd,
		hasUI: true,
		model: { provider: "openai", id: "gpt-test", contextWindow: 128000 },
		modelRegistry: { getAvailable() { return []; } },
		sessionManager: {
			getBranch() { return branchEntries; },
			getLeafId() { return branchEntries.at(-1)?.id ?? null; },
			getSessionId() { return "session-test"; },
		},
		ui: {
			theme: { fg(_color, text) { return text; }, bold(text) { return text; } },
			async custom(factory, options) {
				return custom(factory, options);
			},
			notify() {},
			setStatus() {},
			setWorkingMessage() {},
			setWorkingIndicator() {},
			getEditorComponent() { return undefined; },
			setEditorComponent() {},
			async editor() {},
			async select() { return undefined; },
			async input() { return undefined; },
			async confirm() { return false; },
		},
		getContextUsage() {
			return { tokens: 1000, percent: 1, contextWindow: 128000 };
		},
		isIdle() { return true; },
		abort() {},
		compact() { compactCount += 1; },
		async waitForIdle() {},
		setBranch(entries) { branchEntries = entries; },
	};
	return ctx;
}

function continuationArtifactJson() {
	const brief = {
		task: "Continue the task.",
		done_when: "A valid pi-continue/v4 continuation ledger is saved.",
		forbid: [{ rule: "Do not write guessed artifacts.", source: "user@msg-test-fixture" }],
		established: [{
			claim: "Compaction synthesis succeeded for this fixture.",
			evidence: "tests/ledger-rows.test.ts:1",
			basis: "test",
			reopen: "none",
		}],
		learned: [],
		open: [{ question: "Does the next compaction also succeed?", verifies: "Run the next cycle and parse its artifact." }],
		next: [{ action: "Run the next validation step.", outcome: "A new established entry covers the validation result." }],
	};
	return JSON.stringify({
		version: "pi-continue-artifacts/v4",
		brief,
		agentGuideUpdate: { content: null, reason: "No guide write." },
	});
}

function compactionEvent(preparation = {}) {
	return {
		preparation: {
			firstKeptEntryId: "kept-entry",
			messagesToSummarize: [{ role: "user", content: [{ type: "text", text: "continue the task" }], timestamp: 0 }],
			turnPrefixMessages: [],
			isSplitTurn: false,
			tokensBefore: 1200,
			previousSummary: undefined,
			fileOps: { read: new Set(), written: new Set(), edited: new Set() },
			settings: { enabled: true, reserveTokens: 1000, keepRecentTokens: 200 },
			...preparation,
		},
		branchEntries: [],
		customInstructions: undefined,
		signal: new AbortController().signal,
	};
}

function assistantMessage() {
	return {
		role: "assistant",
		provider: "openai",
		model: "gpt-test",
		content: [{ type: "text", text: "continuing" }],
		usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		stopReason: "stop",
		timestamp: 0,
	};
}

// --- Proof 1: the ledger row is appended, structured, before the summary exists ---

test("appends a structured brief-checkpoint row on package-owned compaction, then a proof-mark row", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "pi-continue-ledger-rows-"));
	const faux = registerFauxProvider();
	try {
		faux.setResponses([fauxAssistantMessage(continuationArtifactJson())]);
		const pi = createFakePi(cwd);
		const ctx = createCommandContext(cwd, async () => undefined);
		ctx.model = faux.models[0];
		ctx.modelRegistry.getApiKeyAndHeaders = async () => ({ ok: true, apiKey: "test", headers: {} });
		registerContinueExtension(pi);
		await pi.commands.get("continue").handler("steer", ctx);
		const result = await pi.events.get("session_before_compact")(compactionEvent(), ctx);
		assert.ok("compaction" in result, "package-owned compaction succeeds");

		const rows = pi.appendedEntries.filter((entry) => entry.customType === LEDGER_ROW_CUSTOM_TYPE);
		assert.equal(rows.length, 1, "exactly one ledger row is appended by the compaction checkpoint");
		const row = rows[0].data;
		assert.equal(row.schema, LEDGER_ROW_SCHEMA);
		assert.equal(row.kind, "brief-checkpoint");
		assert.equal(row.seq, 1);
		assert.equal(row.eventId, "continue-1");
		assert.equal(row.compactionEntryId, null);
		assert.equal(typeof row.ts, "string");
		// Structured seven-field brief, not markdown:
		assert.equal(row.brief.task, "Continue the task.");
		assert.equal(row.brief.done_when, "A valid pi-continue/v4 continuation ledger is saved.");
		assert.equal(row.brief.forbid[0].rule, "Do not write guessed artifacts.");
		assert.equal(row.brief.established[0].basis, "test");
		assert.equal(row.brief.open[0].question, "Does the next compaction also succeed?");
		assert.equal(row.brief.next[0].action, "Run the next validation step.");
		assert.deepEqual(row.brief.learned, []);
		// The row carries the epistemic contract about itself:
		assert.equal(row.provenance.basis, "output");
		assert.match(row.provenance.evidence, /continue-1/);
		assert.ok(row.provenance.reopen.length > 0);

		await pi.events.get("session_compact")({
			fromExtension: true,
			compactionEntry: { id: "compact-proof-1", summary: result.compaction.summary, details: result.compaction.details },
		}, ctx);
		const rowsAfter = pi.appendedEntries.filter((entry) => entry.customType === LEDGER_ROW_CUSTOM_TYPE);
		assert.equal(rowsAfter.length, 2, "session_compact appends the proof-mark row");
		const proof = rowsAfter[1].data;
		assert.equal(proof.kind, "proof-mark");
		assert.equal(proof.seq, 2);
		assert.equal(proof.eventId, "continue-1");
		assert.equal(proof.compactionEntryId, "compact-proof-1");
	} finally {
		faux.unregister();
		rmSync(cwd, { recursive: true, force: true });
	}
});

// --- Proof 2: projection fidelity (round-trip through the row, not the markdown) ---

test("reduceLedgerRows reproduces the exact synthesized brief object", () => {
	const brief = {
		task: "T",
		done_when: "D",
		forbid: [{ rule: "R", source: "S" }],
		established: [{ claim: "C", evidence: "E", basis: "test", reopen: "none" }],
		learned: [{ lesson: "L", source: "S" }],
		open: [{ question: "Q", verifies: "V" }],
		next: [{ action: "A", outcome: "O" }],
	};
	const entries = [
		{ id: "m1", type: "message" },
		{ id: "c1", type: "custom", customType: LEDGER_ROW_CUSTOM_TYPE, data: {
			schema: LEDGER_ROW_SCHEMA, seq: 1, eventId: "e1", compactionEntryId: null,
			kind: "brief-checkpoint", brief,
			provenance: { evidence: "synthesis", basis: "output", reopen: "superseded by next checkpoint" },
			ts: "2026-08-21T00:00:00Z",
		} },
		{ id: "c2", type: "custom", customType: "other-extension/row", data: { anything: true } },
	];
	const projection = reduceLedgerRows(entries);
	assert.deepEqual(projection.brief, brief);
	assert.equal(projection.checkpointSeq, 1);
	assert.equal(projection.rowCount, 1);
	assert.deepEqual(projection.supersededSeqs, []);
});

// --- Proof 3: rebuild independence (fresh reduction over the same log) ---

test("a fresh runtime reduces the same log to the same projection", () => {
	const rows = [
		{ schema: LEDGER_ROW_SCHEMA, seq: 1, eventId: "e1", compactionEntryId: null, kind: "brief-checkpoint",
			brief: { task: "one", done_when: "d", forbid: [], established: [], learned: [], open: [], next: [] },
			provenance: { evidence: "s", basis: "output", reopen: "r" }, ts: "t1" },
		{ schema: LEDGER_ROW_SCHEMA, seq: 2, eventId: "e1", compactionEntryId: "compact-1", kind: "proof-mark", ts: "t2" },
		{ schema: LEDGER_ROW_SCHEMA, seq: 3, eventId: "e2", compactionEntryId: null, kind: "brief-checkpoint",
			brief: { task: "two", done_when: "d", forbid: [], established: [], learned: [], open: [], next: [] },
			provenance: { evidence: "s", basis: "output", reopen: "r" }, ts: "t3" },
	];
	const entries = rows.map((data, index) => ({ id: `c${index}`, type: "custom", customType: LEDGER_ROW_CUSTOM_TYPE, data }));
	// Simulate a session reload: brand-new array, no shared runtime state, reduce twice.
	const first = reduceLedgerRows([...entries]);
	const second = reduceLedgerRows([...entries]);
	assert.deepEqual(first, second);
	assert.equal(first.brief.task, "two", "latest checkpoint wins");
	assert.equal(first.checkpointSeq, 3);
	assert.deepEqual(first.proofMarks.map((mark) => mark.compactionEntryId), ["compact-1"]);
});

// --- Proof 4: append-only reopen supersedes without editing the log ---

test("reopen-mark plus corrected checkpoint supersedes; the superseded row stays in the log", () => {
	const v1 = { task: "old", done_when: "d", forbid: [], established: [], learned: [], open: [], next: [] };
	const v2 = { task: "corrected", done_when: "d", forbid: [], established: [], learned: [], open: [], next: [] };
	const rows = [
		{ schema: LEDGER_ROW_SCHEMA, seq: 1, eventId: "e1", compactionEntryId: null, kind: "brief-checkpoint", brief: v1,
			provenance: { evidence: "s", basis: "output", reopen: "r" }, ts: "t1" },
		{ schema: LEDGER_ROW_SCHEMA, seq: 2, eventId: "e1", kind: "reopen-mark", supersedesSeq: 1, reason: "stale task", ts: "t2" },
		{ schema: LEDGER_ROW_SCHEMA, seq: 3, eventId: "e1", compactionEntryId: null, kind: "brief-checkpoint", brief: v2,
			provenance: { evidence: "s", basis: "output", reopen: "r" }, ts: "t3" },
	];
	const entries = rows.map((data, index) => ({ id: `c${index}`, type: "custom", customType: LEDGER_ROW_CUSTOM_TYPE, data }));
	const projection = reduceLedgerRows(entries);
	assert.equal(projection.brief.task, "corrected");
	assert.deepEqual(projection.supersededSeqs, [1]);
	assert.equal(projection.rowCount, 3, "no row is edited or removed");

	// Revoking the newest checkpoint falls back to the previous non-superseded one.
	const fallback = reduceLedgerRows([
		{ id: "d0", type: "custom", customType: LEDGER_ROW_CUSTOM_TYPE, data: rows[0] },
		{ id: "d1", type: "custom", customType: LEDGER_ROW_CUSTOM_TYPE, data: rows[2] },
		{ id: "d2", type: "custom", customType: LEDGER_ROW_CUSTOM_TYPE, data: {
			schema: LEDGER_ROW_SCHEMA, seq: 4, eventId: "e1", kind: "reopen-mark", supersedesSeq: 3, reason: "bad synthesis", ts: "t4",
		} },
	]);
	assert.equal(fallback.brief.task, "old", "falls back to seq 1 once seq 3 is revoked");
	assert.deepEqual(fallback.supersededSeqs, [3]);

	// When every checkpoint is superseded, the projection is empty (fail-closed, never stale).
	const revoked = reduceLedgerRows([...entries, { id: "c3", type: "custom", customType: LEDGER_ROW_CUSTOM_TYPE, data: {
		schema: LEDGER_ROW_SCHEMA, seq: 4, eventId: "e1", kind: "reopen-mark", supersedesSeq: 3, reason: "bad synthesis", ts: "t4",
	} }]);
	assert.equal(revoked.brief, undefined);
	assert.deepEqual(revoked.supersededSeqs, [1, 3]);
});
