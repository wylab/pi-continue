import test from "node:test";
import assert from "node:assert/strict";
import { parseHistoryArtifacts } from "../extensions/continue/src/blocks.ts";

const ANCHOR_TOKEN_PATTERN = /(?::\d+\b|@\w[\w-]*\b|^cmd:|^doc:https?:\/\/|^test:\S+\b)/m;
const PATH_LINE_PATTERN = /\b[\w./-]+:\d+\b/;

interface ContractValidationResult {
	valid: boolean;
	failures: string[];
}

function sectionBody(text: string, heading: string): string {
	const marker = `## ${heading}`;
	const start = text.indexOf(marker);
	if (start < 0) return "";
	const bodyStart = start + marker.length;
	const nextHeading = text.indexOf("\n## ", bodyStart);
	return nextHeading < 0 ? text.slice(bodyStart) : text.slice(bodyStart, nextHeading);
}

function establishedEntryEvidence(text: string): string[] {
	const body = sectionBody(text, "Established").trim();
	if (body.length === 0) return [];
	return body.split("\n").map((line) => {
		const match = line.match(/evidence:\s*([^;]+);/);
		return match ? match[1].trim() : "";
	}).filter((entry) => entry.length > 0);
}

function validateAnchorContract(text: string): ContractValidationResult {
	const failures: string[] = [];
	const evidenceEntries = establishedEntryEvidence(text);
	if (evidenceEntries.length === 0) {
		failures.push("expected at least one established entry in the rendered brief");
	}
	for (const evidence of evidenceEntries) {
		const looksAnchored = ANCHOR_TOKEN_PATTERN.test(evidence) || PATH_LINE_PATTERN.test(evidence);
		if (!looksAnchored) {
			failures.push(`evidence "${evidence}" lacks a navigable anchor token`);
		}
	}
	return { valid: failures.length === 0, failures };
}

function briefEnvelope(overrides: Record<string, unknown> = {}) {
	return {
		task: "Verify the contract-validator anchor rules.",
		done_when: "Every established entry has a navigable evidence anchor.",
		forbid: [{ rule: "Do not skip anchor checks.", source: "user@msg-test-contract" }],
		established: [{
			claim: "Anchor tokens carry navigable identifiers.",
			evidence: "tests/contract-validator.test.ts:1",
			basis: "test",
			reopen: "if the anchor pattern changes",
		}],
		learned: [],
		open: [{
			question: "Are anchor sentinels exhaustive?",
			verifies: "Add a counter-example test and confirm it fails as expected.",
		}],
		next: [{
			action: "Run pnpm test to confirm anchor coverage.",
			outcome: "Open question closes when the new test fails on the malformed fixture.",
		}],
		...overrides,
	};
}

function envelope(overrides: Record<string, unknown> = {}) {
	return JSON.stringify({
		version: "pi-continue-artifacts/v4",
		brief: briefEnvelope(overrides),
		agentGuideUpdate: { content: null, reason: "no guide write warranted by this fixture" },
	});
}

function parseBrief(text: string): string {
	const parsed = parseHistoryArtifacts(text);
	assert.equal(parsed.ok, true);
	if (!parsed.ok) throw new Error(`expected parsed brief, got ${parsed.code}`);
	return parsed.artifacts.briefMarkdown;
}

test("rendered brief preserves anchored established evidence", () => {
	const brief = parseBrief(envelope());
	const validation = validateAnchorContract(brief);
	assert.deepEqual(validation, { valid: true, failures: [] });
});

test("multiple anchor styles are all considered navigable", () => {
	const brief = parseBrief(envelope({
		established: [
			{ claim: "test anchor style", evidence: "tests/foo.ts:42", basis: "test", reopen: "none" },
			{ claim: "user anchor style", evidence: "user@msg-abc123", basis: "user", reopen: "none" },
			{ claim: "doc anchor style", evidence: "doc:https://example.com/spec#section-3", basis: "doc", reopen: "none" },
			{ claim: "cmd anchor style", evidence: "cmd:pnpm test#exit-status", basis: "output", reopen: "none" },
		],
	}));
	const validation = validateAnchorContract(brief);
	assert.deepEqual(validation.failures, []);
	assert.equal(validation.valid, true);
});

test("rendered brief surfaces forbid rules verbatim with source attribution", () => {
	const brief = parseBrief(envelope({
		forbid: [
			{ rule: "Do not delete vendor/.", source: "user@msg-vendor-lock" },
			{ rule: "Do not add another artifact contract.", source: "design decision" },
		],
	}));
	const forbidBody = sectionBody(brief, "Forbid");
	assert.match(forbidBody, /Do not delete vendor\/\.\s+—\s+source:\s+user@msg-vendor-lock/);
	assert.match(forbidBody, /Do not add another artifact contract\.\s+—\s+source:\s+design decision/);
});

test("rendered brief identifies next[0] as the immediate resume action", () => {
	const brief = parseBrief(envelope({
		next: [
			{ action: "Run pnpm run gate.", outcome: "Either exit 0 or a triage point." },
			{ action: "Commit if gate passes.", outcome: "Working tree clean at SHA X." },
		],
	}));
	const nextBody = sectionBody(brief, "Next").trim();
	const firstLine = nextBody.split("\n")[0];
	assert.match(firstLine, /^- Run pnpm run gate\.\s+→\s+Either exit 0 or a triage point\./);
});

test("anchor validator flags evidence that lacks a navigable token", () => {
	const malformed = "## Established\n- placeholder claim — evidence: vague file note; basis: observed; reopen: none";
	const validation = validateAnchorContract(malformed);
	assert.equal(validation.valid, false);
	assert.match(validation.failures[0], /lacks a navigable anchor token/);
});

test("anchor validator demands at least one established entry", () => {
	const empty = "## Task\nx\n\n## Done When\ny";
	const validation = validateAnchorContract(empty);
	assert.equal(validation.valid, false);
	assert.deepEqual(validation.failures, ["expected at least one established entry in the rendered brief"]);
});
