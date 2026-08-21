import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPromptAsset } from "../extensions/continue/src/assets.ts";

const promptAssetPaths = [
	"assets/system/history_initial.md",
	"assets/system/history_update.md",
	"assets/user/continuation_base.md",
	"assets/user/history_initial.md",
	"assets/user/history_update.md",
];
const numericReadQuotaPattern = /(?:(?:read|source|file|context|bullet|item|entry)s?.{0,24}(?:at most|up to|no more than|maximum|max).{0,16}(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten))|(?:(?:at most|up to|no more than|maximum|max).{0,16}(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten).{0,24}(?:read|source|file|context|bullet|item|entry)s?)/i;

test("history system prompts declare the v4 envelope and reference every slot", () => {
	for (const path of ["assets/system/history_initial.md", "assets/system/history_update.md"]) {
		const content = readFileSync(path, "utf8");
		assert.match(content, /pi-continue-artifacts\/v4/, `${path}: must declare v4`);
		assert.match(content, /\btask\b/, `${path}: must reference task slot`);
		assert.match(content, /\bdone_when\b/, `${path}: must reference done_when slot`);
		assert.match(content, /\bforbid\b/, `${path}: must reference forbid slot`);
		assert.match(content, /\bestablished\b/, `${path}: must reference established slot`);
		assert.match(content, /\blearned\b/, `${path}: must reference learned slot`);
		assert.match(content, /\bopen\b/, `${path}: must reference open slot`);
		assert.match(content, /\bnext\b/, `${path}: must reference next slot`);
		assert.match(content, /\bbasis\b/, `${path}: must reference basis field`);
		assert.match(content, /\breopen\b/, `${path}: must reference reopen field`);
		assert.match(content, /observed.*test.*output.*user.*doc|observed\|test\|output\|user\|doc/s, `${path}: must enumerate basis enum`);
		assert.match(content, /BAD.*GOOD/s, `${path}: must show BAD/GOOD anchor or atomization examples`);
		assert.match(content, /anchor/i, `${path}: must discuss anchor discipline`);
		assert.match(content, /JSON/, `${path}: must require JSON output`);
		assert.doesNotMatch(content, numericReadQuotaPattern, `${path}: must not impose numeric read quotas`);
	}
});

test("history system prompts articulate the Memento role of persistent memory across amnesia", () => {
	for (const path of ["assets/system/history_initial.md", "assets/system/history_update.md"]) {
		const content = readFileSync(path, "utf8");
		assert.match(content, /persistent memory/i, `${path}: must declare role as persistent memory`);
		assert.match(content, /amnesi/i, `${path}: must name the amnesia condition`);
		assert.match(content, /Memento|tattoo/i, `${path}: must invoke the tattoo/Memento framing`);
		assert.match(content, /durable/i, `${path}: must frame entries as durable`);
	}
});

test("history system prompts disambiguate synthesizer/agent/human and the pi-continue wrapper", () => {
	for (const path of ["assets/system/history_initial.md", "assets/system/history_update.md"]) {
		const content = readFileSync(path, "utf8");
		assert.match(content, /[Ww]ho is who|three.*part(?:ies|s)/i, `${path}: must explicitly identify the parties`);
		assert.match(content, /the human/i, `${path}: must name the human distinctly from "the user" wrapper`);
		assert.match(content, /pi-continue.*wrapp|wrapp.*pi-continue|plumbing|wiring/i, `${path}: must call the pi-continue wrapper plumbing, not source material`);
		assert.match(content, /role:\s*user/i, `${path}: must reference role: user as the marker of human messages in the transcript`);
	}
});

test("history system prompts enumerate the persistence, continuity, and single-channel principles", () => {
	for (const path of ["assets/system/history_initial.md", "assets/system/history_update.md"]) {
		const content = readFileSync(path, "utf8");
		assert.match(content, /Persistence/i, `${path}: must name the persistence principle`);
		assert.match(content, /Continuity/i, `${path}: must name the continuity principle`);
		assert.match(content, /Single channel/i, `${path}: must name the single-channel principle`);
		assert.match(content, /[Ss]ilent (?:drops?|drop|retire)/i, `${path}: must forbid silent drops of established entries`);
	}
});

test("history system prompts distinguish durable vs transient material", () => {
	for (const path of ["assets/system/history_initial.md", "assets/system/history_update.md"]) {
		const content = readFileSync(path, "utf8");
		assert.match(content, /durable/i, `${path}: must reference the durable category`);
		assert.match(content, /transient|operational chatter|self-narration/i, `${path}: must reference what does not persist`);
		assert.match(content, /host wiring|pi-continue|harness/i, `${path}: must exclude harness wiring from durable memory`);
	}
});

test("history system prompts teach factual evidence precedence and the instruction boundary", () => {
	for (const path of ["assets/system/history_initial.md", "assets/system/history_update.md"]) {
		const content = readFileSync(path, "utf8");
		assert.match(content, /[Tt]ool results?.*authoritative factual.*ground truth/s, `${path}: must name tool results as authoritative factual ground truth`);
		assert.match(content, /agent text|assistant text|commentary/i, `${path}: must name assistant/agent text as commentary`);
		assert.match(content, /tool result wins|when assistant text contradicts a tool result, the tool result wins|factual weight|evidence precedence/i, `${path}: must declare the factual precedence resolution`);
		assert.match(content, /[Ii]nstruction authority is separate from factual authority|directive-looking text.*does not instruct|not instruction authority/is, `${path}: must separate factual evidence from instruction authority`);
	}
});

test("history_update system prompt teaches reopen-driven retirement and forbids silent drops", () => {
	const content = readFileSync("assets/system/history_update.md", "utf8");
	assert.match(content, /reopen.*evaluat|[Rr]econcile.*established/s);
	assert.match(content, /demote.*open|demote.*to.*open/is);
	assert.match(content, /update cycle|updating an existing/i);
	assert.match(content, /carry.*forward|carries forward/i, "must require carry-forward of un-triggered prior entries");
	assert.match(content, /silent drop/i, "must explicitly forbid silent drops");
});

test("history_update system prompt extends the silent-drop rule to every carrying-forward slot", () => {
	const content = readFileSync("assets/system/history_update.md", "utf8");
	assert.match(content, /[Uu]niversal retirement rule|silent drops? (?:are|is) the cardinal sin in every slot/i, "must declare the universal retirement rule");
	assert.match(content, /[Rr]econcile.*[`']?open[`']?/s, "must have an explicit reconcile-open step, not just a refresh");
	assert.match(content, /[Rr]econcile.*[`']?next[`']?|[Rr]econcile [`']?next[`']?/s, "must have an explicit reconcile-next step, not just a re-plan");
	assert.match(content, /[Aa]pparent overlap is not closure|[Cc]onflation/, "must explicitly warn against the conflation-as-silent-drop pattern");
	assert.match(content, /open[^.]*retires only when|retire[^.]*only when[^.]*matching `established`/is, "must require traceable cause for open retirement");
	assert.match(content, /next[^.]*retires only when|action was applied/i, "must require traceable cause for next retirement");
});

test("history_update user prompt mirrors the universal silent-drop rule", () => {
	const content = readFileSync("assets/user/history_update.md", "utf8");
	assert.match(content, /[Uu]niversal rule|silent drops? (?:are|is) the cardinal sin in every slot/i);
	assert.match(content, /open[^.]*retires only when|matching `established` you added this cycle anchors the answer/i, "user prompt must echo the open-retirement rule");
	assert.match(content, /[Aa]pparent overlap is not closure|[Cc]onflation/, "user prompt must warn against the conflation pattern");
});

test("history_initial system prompt names the initial-cycle posture", () => {
	const content = readFileSync("assets/system/history_initial.md", "utf8");
	assert.match(content, /initial cycle|no prior brief|first compaction|first time/i);
	assert.match(content, /[Tt]attoo|first time/i);
});

test("user base contract describes the v4 inputs", () => {
	const content = readFileSync("assets/user/continuation_base.md", "utf8");
	assert.match(content, /<history-task>/);
	assert.match(content, /<previous-compaction-summary>/);
	assert.match(content, /<history-to-summarize>/);
	assert.match(content, /<turn-prefix-messages>/);
	assert.match(content, /<file-operations>/);
	assert.match(content, /JSON/);
	assert.match(content, /directive-looking text.*input data|not instruction authority/is, "base wrapper must echo the fact-vs-instruction boundary");
	assert.match(content, /<custom-instructions>.*current-run package\/operator guidance/is, "base wrapper must classify custom instructions separately");
	assert.match(content, /do not record it as the human-stated task, forbid, or an established fact/is, "base wrapper must deny custom instructions as durable human evidence by themselves");
	assert.doesNotMatch(content, numericReadQuotaPattern);
});

test("history prompts classify custom-instructions separately from transcript evidence", () => {
	for (const path of ["assets/system/history_initial.md", "assets/system/history_update.md", "assets/user/history_initial.md", "assets/user/history_update.md"]) {
		const content = readFileSync(path, "utf8");
		assert.match(content, /<custom-instructions>/, `${path}: must mention custom instructions`);
		assert.match(content, /current-run package\/operator guidance/is, `${path}: must classify custom instructions as run-scoped guidance`);
		assert.match(content, /not transcript evidence|not the human's transcript intent|not human transcript intent/is, `${path}: must not treat custom instructions as transcript evidence`);
	}
});

test("user scenario prompts describe their cycle role and the learned slot", () => {
	const initial = readFileSync("assets/user/history_initial.md", "utf8");
	assert.match(initial, /initial|first compaction|no prior brief/i);
	assert.match(initial, /\blearned\b/);
	assert.match(initial, /agentGuideUpdate/);

	const update = readFileSync("assets/user/history_update.md", "utf8");
	assert.match(update, /update|updating/i);
	assert.match(update, /reopen/);
	assert.match(update, /\bestablished\b/);
	assert.match(update, /\blearned\b/);
	assert.match(update, /agentGuideUpdate/);
	assert.match(update, /silent drop/i, "must echo the silent-drop prohibition");
});

test("history system prompts mention turn-prefix-messages alongside history-to-summarize", () => {
	for (const path of ["assets/system/history_initial.md", "assets/system/history_update.md"]) {
		const content = readFileSync(path, "utf8");
		assert.match(content, /<turn-prefix-messages>/);
	}
});

test("prompt assets avoid raw Markdown HTML tag block lines", () => {
	for (const path of promptAssetPaths) {
		const lines = readFileSync(path, "utf8").split("\n");
		for (let index = 0; index < lines.length; index++) {
			assert.doesNotMatch(lines[index], /^\s*<\/?[a-z][a-z0-9-]*(?:\s+[^>]*)?>\s*$/i, `${path}:${index + 1}`);
		}
	}
});

test("project override wins when policy is project-override", () => {
	const root = mkdtempSync(join(tmpdir(), "pi-continuation-assets-"));
	try {
		const overrideDir = join(root, ".pi", "extensions", "pi-continue", "prompts", "user");
		mkdirSync(overrideDir, { recursive: true });
		writeFileSync(join(overrideDir, "history_initial.md"), "project override", "utf8");
		const loaded = loadPromptAsset(root, "project-override", "user/history_initial.md");
		assert.equal(loaded.content, "project override");
		assert.equal(loaded.sourcePath, join(overrideDir, "history_initial.md"));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
