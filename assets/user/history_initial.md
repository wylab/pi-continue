# Initial cycle

This is the first compaction in this thread. There is no prior brief; `<previous-compaction-summary>` is `(none)`. You are tattooing the agent's identity for the first time.

## What goes where

- `task` and `done_when` come from the human's request (their messages in the transcript) and the conversation arc. One sentence each.
- `forbid` is usually empty unless the human has already stated explicit prohibitions, locked decisions, or hard constraints.
- `established` is usually small on an initial cycle. Only include anchored closures actually proven in this transcript; speculative claims belong in `open`.
- `learned` may be small or empty on an initial cycle. Include only insights with real reuse value (codebase patterns confirmed across many reads, human preferences confirmed across messages, dead-end paths with their reason, successful approaches).
- `open` lists what the agent still needs to verify or decide. Each entry pairs the question with what evidence would close it.
- `next` lists the immediate plan in execution order. `next[0]` is the exact action the future agent should perform on resume.

## Agent guide

Set `agentGuideUpdate.content` to `null` unless the cycle produced durable operating guidance worth landing in AGENTS.md (corrected command truth, stable human preferences, reusable procedures, repo-wide rules). Most initial cycles do not warrant a guide update. Explain the decision in `agentGuideUpdate.reason`. If you do write content, it must be the full replacement guide, not a patch.

## Inputs to read

- `<history-to-summarize>` and `<turn-prefix-messages>` — the transcript material.
- `<file-operations>` — files read or modified during this cycle (signal, not evidence).
- `<existing-agent-guide>` — usually `(none)` on initial; fold into your synthesis if present.
- `<custom-instructions>` — current-run package/operator guidance for this synthesis pass, if any; it is not transcript evidence or human transcript intent.
