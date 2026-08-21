# Spine Prototype Design — session-as-projection milestone (M1)

Status: design, 2026-08-21. First engine milestone from `docs/domain-model.md` gap G1.
Scope discipline: this prototype proves the projection property only. Per-field engines,
knowledge net, economy, and pods are later milestones and explicitly out of scope here.

## Goal

Demonstrate, with tests, that the continuation brief (the seven v4 fields) can live as
**structured rows in a durable, append-only ledger** and that the live session state is a
**rebuildable projection** of those rows — not the other way around.

Today the causality is inverted: the compaction summary is the source, and the "ledger" is a
markdown view rebuilt from it. The prototype flips one thin slice: the brief becomes ledger
rows first; the markdown brief becomes a rendering.

## Mechanism (Pi 0.84.2 public surface only)

- **Ledger row** = `pi.appendEntry("pi-continue/ledger-row", data)` → a `CustomEntry`
  (`type: "custom"`): persisted in the session file, never sent to the LLM.
- **Projection read** = `ctx.sessionManager.getBranch()` includes `CustomEntry`s; filter by
  `customType`, reduce in append order.
- **Checkpoint** = existing `session_before_compact` extension-owned compaction (unchanged);
  after a successful synthesis, the parsed v4 brief is appended as a ledger row *before* the
  compaction result is returned, so the ledger is durable before the summary exists.
- **Recall injection** = `CustomMessageEntry` (`type: "custom_message"`, enters context) used
  only to surface projection deltas (e.g., after reopen/supersession), not as the store.
- **Rebuild proof** = construct a fresh runtime (no in-memory state), reduce the branch's
  ledger rows, assert the rebuilt brief equals the synthesized one.

## Row schema (v0)

```jsonc
{
  "schema": "pi-continue-ledger-row/v0",
  "seq": 1,                      // per-session monotonic, assigned by the appender
  "eventId": "continue-1",       // owning continuation event
  "compactionEntryId": null,     // filled by the session_compact follow-up row
  "kind": "brief-checkpoint",    // v0 kinds: brief-checkpoint | proof-mark | reopen-mark
  "brief": { /* the seven v4 fields, structured (not markdown) */ },
  "provenance": {
    "evidence": "session_before_compact synthesis, event continue-1",
    "basis": "test",             // epistemic basis axis (G5) — carried from day one
    "reopen": "on schema change or conflicting checkpoint"
  },
  "ts": "2026-08-21T13:00:00Z"
}
```

Design rules:

1. **Append-only.** Corrections are new rows (`reopen-mark` superseding a prior `seq`), never
   edits. Reduction = last-writer-wins per field, honoring reopen marks.
2. **Structured, not markdown.** `blocks.ts` markdown rendering becomes a *projection* of the
   row's `brief` object (keeps the v4 contract byte-compatible for the compaction summary).
3. **Basis axis carried now** (G5): even though no engine verifies it yet, every row records
   `evidence`/`basis`/`reopen` so later per-field engines have the contract from row one.
4. **No private internals.** Only `pi.appendEntry`, `ctx.sessionManager` reads, and the public
   events. `pi-internals.ts` stays untouched by this milestone.

## Prototype code layout

- `extensions/continue/src/ledger-rows.ts` — row types, `appendLedgerRow(pi, row)`,
  `reduceLedgerRows(entries)` → projected brief + provenance log.
- `index.ts` — one insertion point: after `historyArtifacts` is parsed in the
  `session_before_compact` success path, append a `brief-checkpoint` row; in
  `session_compact`, append the `proof-mark` row carrying `compactionEntryId`.
- `tests/ledger-rows.test.ts` — the four proofs below.

## Test contract (TDD: write these first, red, then implement)

1. **append**: after a successful extension-owned compaction, the branch contains a
   `custom` entry with `customType === "pi-continue/ledger-row"`, `kind === "brief-checkpoint"`,
   and the seven brief fields structured.
2. **projection fidelity**: `reduceLedgerRows(branch)` reproduces the exact brief object the
   synthesizer returned (round-trip through the row, not the markdown).
3. **rebuild independence**: a *fresh* runtime state (simulating session reload) reduces the
   same branch to the same brief — proving the session view is derived from the ledger, not
   from memory.
4. **append-only reopen**: appending a `reopen-mark` for `seq` N followed by a corrected
   `brief-checkpoint` yields the corrected brief, and the superseded row remains in the log.

## Explicit non-goals for M1

- No change to the compaction summary format or the v4 markdown contract.
- No staleness/enforcement engines (C01 activation is M2+).
- No cross-session restore: CustomEntry rows are durable **in the session file only**
  (session-local by construction; review finding PR #1-2, accepted). The cross-session
  authoritative store is M2: a file-per-node resource addressable across sessions (informed
  by C04's 64 KiB bus cap), with CustomEntry kept as the per-session mirror and
  CustomMessageEntry as recall injection (it enters LLM context; it is never a store).
- No knowledge net, economy, pods.

## Open items

- **Two-writer-resume seq edge** (continue-repairman review of PR #4, non-blocking):
  `nextLedgerSeq` seeds from the branch — safe in-session and across single-writer resume,
  but a stale process appending after a resume could duplicate seq. M2's authoritative
  cross-session store must own sequence allocation (single-writer or CAS).

## Done when

`PI_CODING_AGENT_DIR=<empty> node --experimental-strip-types --test --test-timeout=120000
tests/*.test.ts` is 239/239 **plus** the 4 new ledger-rows tests green, and
`tsc --noEmit && check:json && check:pack` stay green.
