# Engine Domain Model (seed)

Status: seed, recorded 2026-08-21; amended 2026-08-21 for review dispositions (PR #1, Codex
bot findings 1-2, both accepted). Claims' evidence is inline below (repo-relative paths and
dated URLs), so this document is verifiable standalone. The lane-internal full record lives in
the ARA on the shared ara mount (`wylabb-engine/`: `logic/claims.md`, `logic/concepts.md`,
`logic/problem.md`, `logic/related_work.md`); the mount path is machine-local by design and is
NOT a verification dependency. Reopen a claim only when its falsification criterion triggers
or new evidence conflicts.

## 1. Problem

pi-continue 0.9.3 ships a continuation artifact (`pi-continue-artifacts/v4`) with exactly seven
brief slots — `task`, `done_when`, `forbid`, `established`, `learned`, `open`, `next` — parsed by
`extensions/continue/src/blocks.ts`. Those slots are **passive synthesizer output**: the
compaction summary fills them, but nothing reconciles, enforces, or reopens them. And the
"ledger" itself is a projection of the compaction `<continuation>` block, rebuilt inside the
same session (`ledger-viewer.ts`) — a handoff record, not a durable substrate.

**Key insight**: the seven fields are already shipped. The engine's work is not inventing fields
but (a) making the ledger durable-first and cross-session, and (b) turning each passive slot
into an active subsystem engine, with the session as a projection of that durable ledger.

## 2. Ubiquitous language

- **Ledger (spine)** — append-only durable store, primary source of truth; the session
  (context, plan, constraints) is a derived, rebuildable projection of it.
- **Session-as-projection** — materialized view of the durable ledger for one live session;
  deleting the view and rebuilding from the log is guaranteed (event-sourcing / LangGraph
  checkpoint pattern).
- **Per-field engine** — an active subsystem reconciling one ledger field (staleness,
  enforcement, reopen, completion), rather than a passive synthesizer slot.
- **Knowledge network (hidden)** — vault of atomic facts + labels + typed connections, written
  by the swarm, never surfaced as user-editable context.
- **Query-only recall** — agents recall from the network but never write it directly; the write
  path is a separate entry point (Veracium: "add an entry point, not a parameter").
- **Epistemic contract** — per-claim `evidence` (who reported it), `basis` (does the source
  support it), `reopen` (supersession/revocation/renewal); trust capped at
  `min(author, derived_from)`.
- **Internal economy** — agent-earned budget with internal prices (delegation cheap, direct
  work expensive), no external payment rail; bookkeeping as ledger rows.
- **Terrarium pod** — persistent-but-recyclable isolation unit running an unattended agent,
  with fleet observability; local-first, no container-runtime assumption.
- **CustomEntry** — session entry via `pi.appendEntry` (`type: "custom"`): persists extension
  state WITHOUT entering LLM context. The ledger-row slot.
- **CustomMessageEntry** — `type: "custom_message"`: DOES enter LLM context. The recall/evidence
  injection slot.
- **session_before_compact** — the hook whose return may supply `{ compaction: {...} }`,
  replacing Pi's native summarizer (`fromExtension = true`). The ledger checkpoint hook.
- **Extension bus** — pi-intercom's cross-process, owner-elected, revisioned shared state
  (`commitState` with `expectedRevision`; 64 KiB per-namespace cap). Suitable for a contract
  spine, not a full knowledge network.

## 3. Domain claims (falsifiable; proof in the ARA)

| ID | Claim | Evidence (verifiable standalone) | Status |
|----|-------|----------------------------------|--------|
| C01 | The seven ledger fields ship as passive slots, not active engines. | `extensions/continue/src/blocks.ts` (parses exactly the seven slots, no reconciliation); `assets/system/history_initial.md` (slot list). Falsified if blocks.ts/resume prompt drives per-field staleness/reopen logic. | supported |
| C02 | No shipped system composes "append-only ledger → per-field engines → session-as-materialized-view". | `extensions/continue/src/ledger-viewer.ts` (ledger = same-session projection of the compaction block); langchain-ai.github.io/langgraph/concepts/persistence/ (2026-08-21; checkpoint-log atoms only). Falsified by a shipped durable ledger + per-field engines composition. | supported |
| C03 | The evidence-correct local core is **pi-continue + pi-intercom + pi-subagents**; `pi-crew` is a phantom, `loop.ts` trivial, `pi-rtk-optimizer` orthogonal. | Local grep 2026-08-21: zero consumers of `pi-crew.json` across installed packages and the Pi host tree; pi-subagents = 211 source files (subagent tool, RPC, capability ceilings, FleetView). | supported |
| C04 | pi-intercom's extension bus is the existing revisioned cross-session state primitive; its 64 KiB/namespace cap bounds it to a contract spine. | `pi-intercom/broker/extension-state.ts` (optimistic concurrency via `expectedRevision`; 64 KiB cap), v0.11.0 installed. | supported |
| C05 | Query-only (write-separated) knowledge-network access is unclaimed. | Survey 2026-08-21: HippoRAG, Graphiti, cognee, mem0, Letta MemFS all expose the write path to the agent; closest principle: github.com/veracium-ai/Veracium (MIT) design rationale "add an entry point, not a parameter" (2026-08-21). | supported |
| C06 | Agent-earned internal economy is greenfield. | Survey 2026-08-21: MyClaw (user-purchased credits, myclaw.ai), cashclaw (github.com/ertugrulakben/cashclaw, MIT — agents earn/spend but on Stripe rails), Tollgate, helio: all user-funded, crypto-rail, or external-revenue. | supported |
| C07 | The provenance **basis** axis is unimplemented anywhere; evidence + reopen have a reference implementation. | Veracium (MIT) spec 0006 §1 defers `evidence_basis`; spec 0019's ungrounded flag checks extraction fidelity, not source support (both read 2026-08-21). | supported |
| C08 | Lightweight local pod lifecycle + fleet observability is unclaimed. | Survey 2026-08-21: github.com/cohere-ai/cohere-terrarium (MIT, archived — recycle-per-invocation, stateless); docs.openclaw.ai/gateway/sandboxing (mode/scope/backend vocabulary); Firecracker/gVisor/Docker need a container runtime. | supported |

## 4. Gaps → engine milestones

| Gap | Milestone |
|-----|-----------|
| G1 ledger-as-spine composition | **M1 (session-local)**: ledger rows on `pi.appendEntry` CustomEntry (persisted in the session file, never in LLM context); session view rebuilt by reducing `ctx.sessionManager.getBranch()`; recall deltas via CustomMessageEntry. Design: `docs/spine-prototype.md`. **M2 (cross-session)**: CustomEntry rows are session-local by construction, so the *authoritative* store moves to a resource addressable across sessions (file-per-node store, sized by C04's 64 KiB bus-cap finding), with CustomEntry kept as the per-session mirror. CustomMessageEntry is recall injection only — it enters LLM context and is never a store. |
| G2 query-only knowledge net | Swarm-written vault; model-reachable read path only. |
| G3 internal economy | Ledger-row bookkeeping; internal prices; earned budget. |
| G4 terrarium pods | Local pod lifecycle + fleet observability. |
| G5 basis axis | Per-claim basis verification (does the source support the fact), beyond Veracium's evidence/reopen. |

## 5. Pi hook-surface facts (Pi 0.84.2; reopen on Pi upgrade)

- 35 extension events; ~12 have meaningful returns.
- `session_before_compact` = ledger checkpoint hook (extension-provided compaction,
  `fromExtension: true`).
- `pi.appendEntry` CustomEntry = context-free persistent ledger rows; CustomMessageEntry =
  recall injection.
- `ctx.sessionManager` is read-only; `pi.events` is an in-process bus only; no public
  `compaction_end`; no delegation-lifecycle hook.
- `loadPiInternals` is fragile — isolate behind a single adapter
  (`extensions/continue/src/pi-internals.ts`, three-stage resolver).

## 6. Constraints (owner-ruled)

- MIT/Apache-2.0 dependencies only; local-first; no hosted services; no token payment rails.
- The engine is a Pi extension (or package composing extensions), not a daemon, not a skill.
- Pi's public `ExtensionAPI` is the only stable surface.
- Real context overflow (`reason === "overflow"` or `willRetry === true`) is never vetoed.

## 7. Baseline gate status (2026-08-21)

- `engine-baseline` = pristine pi-continue@0.9.3 (npm tarball) + PR #14 + 6-file
  absolute-threshold overlay set; byte-provenance in the baseline commit message.
- Upstream gate: **239/239 tests pass**, plus `tsc --noEmit`, `check:json`, `check:pack`.
  Run tests with `PI_CODING_AGENT_DIR` pointed at an empty dir — otherwise the developer
  machine's real `~/.pi/agent/extensions/pi-continue.json` leaks into test config resolution
  (root cause of the historical "gate hang": an unmocked `modelRegistry.find` call plus a
  no-timeout wait loop).
- Race harnesses (`pi-race-fix.mts` 5/5, `pi-abs-threshold.mts` 7/7) pass against the fork tree.
- Gate catch worth remembering: the overlay's veto await originally sat between the in-flight
  guard check and its flag set, reopening the concurrent-compaction window PR #14 closed.
  Fixed by running the veto inside the in-flight section (commit `763676c`).
