# Update cycle

You are updating an existing continuation. `<previous-compaction-summary>` contains the prior `brief` rendered as Markdown sections (Task, Done When, Forbid, Established, Learned, Open, Next) — this is the durable spine. Each entry there is a tattoo the agent already wears.

## What changes vs what carries forward

**Universal rule**: every carrying-forward slot (`forbid`, `established`, `learned`, `open`, `next`) retires entries only via a traceable, anchored cause that is self-evident from this cycle's added entries. **Silent drops are the cardinal sin in every slot.** If you cannot point at the cause, you carry forward verbatim.

- `task` and `done_when` carry forward from the prior brief unless the human redirected scope in `<history-to-summarize>` or `<turn-prefix-messages>`.
- `forbid` carries forward verbatim. Add new prohibitions from the new transcript. Retire only on explicit human retraction.
- `established`: for each prior entry, evaluate its `reopen` clause against this cycle's evidence. If triggered, demote to `open` with a precise `verifies` plan. If not triggered, copy forward unchanged. Then promote: for every newly anchored observation in the new transcript, add one `established` entry. If you cannot demote via a triggered `reopen`, the entry carries forward verbatim.
- `learned`: carry prior entries forward. Retire only by supersession (cite the supersession in `source`) or explicit human retraction. Add new insights from this cycle's experience.
- `open`: an entry retires only when (a) a matching `established` you added this cycle anchors the answer, (b) a matching `learned` you added this cycle supersedes the question, or (c) the human explicitly retracted it. Otherwise carry forward verbatim. **Apparent overlap is not closure** — two adjacent findings that touch the same file or area are still two findings until each has its own closure trace. Conflation is the disguise silent drops most often wear. Then add new unresolved questions.
- `next`: an entry retires only when the action was applied this cycle in a way you can point to (typically a matching `established` was added whose evidence anchors the outcome). Otherwise carry forward. Add new actions; reorder so `next[0]` is the immediate resume action.

Do not append a new layer alongside the prior brief. Produce one reconciled replacement.

## Agent guide

If a durable operating rule should change AGENTS.md, emit the full replacement in `agentGuideUpdate.content`. Otherwise set `content` to `null`. In either case explain why in `reason`. Active-task learnings stay in the brief's `learned`; only repo-wide rules, stable human preferences, corrected command truth, or reusable procedures belong in the agent guide.

If `<existing-agent-guide>` has content and your `content` is non-null, your replacement must be a complete guide, not a patch — preserve still-correct material and integrate the new rules.

## Inputs to read

- `<previous-compaction-summary>` — the prior brief; the durable spine.
- `<history-to-summarize>` and `<turn-prefix-messages>` — the new transcript material.
- `<file-operations>` — files read or modified during this cycle (signal, not evidence).
- `<existing-agent-guide>` — prior agent guide, if any.
- `<custom-instructions>` — current-run package/operator guidance for this synthesis pass, if any; it is not transcript evidence or human transcript intent.
