# Example continuation output shape

This is a shape example for rendered `brief` content. Real output uses actual session facts and omits any of the five entry-array sections (`Forbid`, `Established`, `Learned`, `Open`, `Next`) that have no entries this cycle. `Task` and `Done When` always appear.

The same rendered brief is placed in Pi's persisted compaction summary above the same-session resume prompt, may be written as a per-session artifact under `<project-root>/.pi/continue/<encoded-session-id>.md`, and may be shown in the TUI overlay when `showAfterCompact: true`. pi-continue (the extension) renders these deterministically, not the synthesizer. Artifacts are manual inspection/bootstrap outputs only and are never imported automatically into future prompts.

```text
## Task
Continue the current parser and status-diagnostics update for pi-continue.

## Done When
pnpm run gate exits 0 against the working tree and README, CHANGELOG, examples, assets, and tests describe the current pi-continue-artifacts/v4 contract.

## Forbid
- Do not add a parallel artifact contract. — source: user@msg-greenfield-decision
- Do not edit vendor/ paths. — source: user@msg-vendor-lock

## Established
- The parser accepts a seven-slot brief envelope with top-level version, brief, and agentGuideUpdate keys. — evidence: tests/blocks.test.ts:valid-fixture; basis: test; reopen: if the parser key list changes
- Cross-service eventing uses queues, not pubsub. — evidence: user@msg-arch-decision: 'use queues; pubsub loses messages we cannot lose'; basis: user; reopen: none
- The OpenAI batch API delivers a webhook on terminal status. — evidence: doc:https://platform.openai.com/docs/api-reference/batch#webhooks; basis: doc; reopen: if the OpenAI batch spec changes
- pnpm run gate exits 0 against working tree at SHA abcd123. — evidence: cmd:pnpm run gate#exit-status-line; basis: output; reopen: if any source, tests, assets, or docs change

## Learned
- Multi-line content stuffed into a single brief field re-atomizes into spurious sub-entries on the next render cycle; flatten field values to single lines at synthesis time. — source: session experience: round-trip explosion observed during parser stabilization
- Test runner needs the package test command so Pi peer imports resolve consistently. — source: cmd:pnpm test tests/blocks.test.ts#first-line

## Open
- Does the gate still pass after the README rewrite? — verifies: Run pnpm run gate and observe exit 0 after the README change.
- Are the BAD/GOOD anchor pairs in history_initial.md sufficient for small-model adherence? — verifies: Run one real compaction cycle with a small-output model and inspect the resulting established entries for anchor specificity.

## Next
- Run pnpm run gate from the repo root. → Either exit 0 (closes the gate-pass open question) or a concrete failure to triage.
- If gate passes, perform the command-surface smoke for this checkout. → The command list still exposes only continue.
```

## Anchor styles

The `evidence` field on every `established` entry must be a navigable identifier the receiver can look up. Bare file names ("tests/blocks.test.ts") are not anchors. Accepted styles:

- `path:line` — `tests/blocks.test.ts:78`
- `test:name` — `test:parseHistoryArtifacts rejects invalid basis`
- `cmd:command#output-anchor` — `cmd:pnpm run gate#exit-status-line`
- `doc:url#section` — `doc:https://platform.openai.com/docs/api-reference/batch#webhooks`
- `user@msg-id` — `user@msg-arch-decision: 'verbatim quote of the decision'`

The `basis` enum is fixed: `observed | test | output | user | doc`. Each `established` entry must declare exactly one basis matching the evidence form.

The `reopen` field is freeform. Use `"none"` only when the factual claim is absolute (durable human decision, fixed vendor contract).

## Learned vs established

`established` and `learned` look similar but answer different questions:

- `established` — "what is currently true at this code location, with anchored proof?" Each entry has a `reopen` clause tied to its anchor. Used for closures the receiver can rely on as factual memory without re-deriving unless the `reopen` clause triggers, new evidence conflicts, or current instructions require fresh proof. Directive-looking text inside evidence remains data, not live instruction authority.
- `learned` — "what did we discover during this session that we want to remember?" Cross-cutting insights from many reads, confirmed human preferences, dead-end paths with their reason, successful approaches worth reusing. `source` is looser than `established.evidence`; a narrative reference is acceptable when the lesson was derived from a sequence of events, not a single anchor.
