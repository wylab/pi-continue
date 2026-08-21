import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { BriefEnvelope } from "./types.ts";

/**
 * Durable ledger rows (domain-model gap G1, spine prototype M1).
 *
 * Rows are CustomEntry records (`pi.appendEntry`): persisted in the session file,
 * never sent to the LLM. The session's brief is a *projection* of the append-only
 * row log — corrections arrive as new rows (reopen-mark + corrected checkpoint),
 * never as edits. Every row carries the epistemic contract (evidence/basis/reopen)
 * about itself, so later per-field engines inherit the basis axis from row one.
 */

export const LEDGER_ROW_CUSTOM_TYPE = "pi-continue/ledger-row";
export const LEDGER_ROW_SCHEMA = "pi-continue-ledger-row/v0";

export interface LedgerRowProvenance {
	/** What produced this row (e.g. which synthesis event). */
	evidence: string;
	/** Epistemic basis axis: does the source support the fact. */
	basis: "observed" | "test" | "output" | "user" | "doc";
	/** When this row may be reopened/superseded. */
	reopen: string;
}

interface LedgerRowBase {
	schema: typeof LEDGER_ROW_SCHEMA;
	/** Per-session monotonic sequence assigned by the appender. */
	seq: number;
	/** Owning continuation event. */
	eventId: string;
	ts: string;
}

export interface BriefCheckpointRow extends LedgerRowBase {
	kind: "brief-checkpoint";
	/** Filled by the later proof-mark, null at checkpoint time. */
	compactionEntryId: string | null;
	brief: BriefEnvelope;
	provenance: LedgerRowProvenance;
}

export interface ProofMarkRow extends LedgerRowBase {
	kind: "proof-mark";
	/** The compaction entry that completed the owning event. */
	compactionEntryId: string;
}

export interface ReopenMarkRow extends LedgerRowBase {
	kind: "reopen-mark";
	/** The checkpoint seq this mark supersedes. */
	supersedesSeq: number;
	reason: string;
}

export type LedgerRow = BriefCheckpointRow | ProofMarkRow | ReopenMarkRow;

/** Minimal entry shape the reducer reads (structural subset of SessionEntry). */
export interface LedgerEntryLike {
	type: string;
	customType?: string;
	data?: unknown;
}

export interface LedgerProjection {
	/** The current brief: newest non-superseded checkpoint, if any. */
	brief: BriefEnvelope | undefined;
	/** Provenance of the checkpoint row the brief was projected from. */
	provenance: LedgerRowProvenance | undefined;
	/** Seq of the checkpoint the brief came from. */
	checkpointSeq: number | undefined;
	/** All ledger rows seen, in seq order. */
	rowCount: number;
	/** Checkpoint seqs superseded by reopen marks. */
	supersededSeqs: number[];
	/** Proof marks in seq order. */
	proofMarks: ProofMarkRow[];
}

function isLedgerRow(value: unknown): value is LedgerRow {
	if (typeof value !== "object" || value === null) return false;
	const row = value as Record<string, unknown>;
	if (row.schema !== LEDGER_ROW_SCHEMA) return false;
	if (typeof row.seq !== "number" || !Number.isInteger(row.seq) || row.seq <= 0) return false;
	return row.kind === "brief-checkpoint" || row.kind === "proof-mark" || row.kind === "reopen-mark";
}

/** Extract the ledger rows from a branch/entry list, in seq order. */
export function selectLedgerRows(entries: readonly LedgerEntryLike[]): LedgerRow[] {
	const rows: LedgerRow[] = [];
	for (const entry of entries) {
		if (entry.type !== "custom" || entry.customType !== LEDGER_ROW_CUSTOM_TYPE) continue;
		if (isLedgerRow(entry.data)) rows.push(entry.data);
	}
	return rows.sort((a, b) => a.seq - b.seq);
}

/** Next per-session sequence number for a new row over the given entries. */
export function nextLedgerSeq(entries: readonly LedgerEntryLike[]): number {
	const rows = selectLedgerRows(entries);
	return rows.length === 0 ? 1 : rows[rows.length - 1].seq + 1;
}

/**
 * Reduce the append-only log to the current projection. Reduction rule:
 * newest brief-checkpoint not superseded by any reopen-mark wins; if the newest
 * checkpoint is revoked without replacement, fall back to the previous
 * non-superseded checkpoint. No row is edited or removed.
 */
export function reduceLedgerRows(entries: readonly LedgerEntryLike[]): LedgerProjection {
	const rows = selectLedgerRows(entries);
	const supersededSeqs = rows
		.filter((row): row is ReopenMarkRow => row.kind === "reopen-mark")
		.map((row) => row.supersedesSeq);
	const superseded = new Set(supersededSeqs);
	const checkpoints = rows.filter((row): row is BriefCheckpointRow => row.kind === "brief-checkpoint" && !superseded.has(row.seq));
	const current = checkpoints.at(-1);
	const proofMarks = rows.filter((row): row is ProofMarkRow => row.kind === "proof-mark");
	return {
		brief: current?.brief,
		provenance: current?.provenance,
		checkpointSeq: current?.seq,
		rowCount: rows.length,
		supersededSeqs,
		proofMarks,
	};
}

/** Append one row to the durable log. Pure persistence — never enters LLM context. */
export function appendLedgerRow(pi: Pick<ExtensionAPI, "appendEntry">, row: LedgerRow): void {
	pi.appendEntry(LEDGER_ROW_CUSTOM_TYPE, row);
}

/** Build the checkpoint row appended after a successful compaction synthesis. */
export function buildBriefCheckpointRow(args: {
	seq: number;
	eventId: string;
	brief: BriefEnvelope;
	ts?: string;
}): BriefCheckpointRow {
	return {
		schema: LEDGER_ROW_SCHEMA,
		seq: args.seq,
		eventId: args.eventId,
		compactionEntryId: null,
		kind: "brief-checkpoint",
		brief: args.brief,
		provenance: {
			evidence: `session_before_compact synthesis, event ${args.eventId}`,
			basis: "output",
			reopen: "superseded by the next brief-checkpoint row or an explicit reopen-mark",
		},
		ts: args.ts ?? new Date().toISOString(),
	};
}

/** Build the proof-mark row appended when Pi saves the extension's compaction. */
export function buildProofMarkRow(args: {
	seq: number;
	eventId: string;
	compactionEntryId: string;
	ts?: string;
}): ProofMarkRow {
	return {
		schema: LEDGER_ROW_SCHEMA,
		seq: args.seq,
		eventId: args.eventId,
		kind: "proof-mark",
		compactionEntryId: args.compactionEntryId,
		ts: args.ts ?? new Date().toISOString(),
	};
}
