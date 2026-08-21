import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildContinuationArtifactPath,
	encodeSessionIdForArtifactPath,
	normalizeMarkdownContent,
	resolveProjectContext,
	writeNormalizedMarkdownFile,
} from "../extensions/continue/src/project.ts";

test("normalizeMarkdownContent trims trailing whitespace and ensures newline", () => {
	assert.equal(normalizeMarkdownContent("a  \n\nb\t\n"), "a\n\nb\n");
});

test("writeNormalizedMarkdownFile avoids rewrites for normalized-equal content", async () => {
	const root = mkdtempSync(join(tmpdir(), "pi-continuation-doc-"));
	const docPath = join(root, ".pi", "continue", "session.md");
	try {
		const first = await writeNormalizedMarkdownFile(docPath, "line\n");
		const second = await writeNormalizedMarkdownFile(docPath, "line  \n");
		assert.equal(first, "updated");
		assert.equal(second, "unchanged");
		assert.equal(readFileSync(docPath, "utf8"), "line\n");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("buildContinuationArtifactPath writes under .pi/continue using an encoded session id", () => {
	assert.equal(encodeSessionIdForArtifactPath("session/with spaces"), "c2Vzc2lvbi93aXRoIHNwYWNlcw");
	assert.equal(
		buildContinuationArtifactPath("/repo", "session/with spaces"),
		join("/repo", ".pi", "continue", "c2Vzc2lvbi93aXRoIHNwYWNlcw.md"),
	);
});

test("resolveProjectContext rejects project-root agent guide paths and never reads continuation docs", async () => {
	const root = mkdtempSync(join(tmpdir(), "pi-continuation-root-path-"));
	try {
		const pi = {
			exec: async () => ({ stdout: `${root}\n`, code: 0 }),
		};
		const context = await resolveProjectContext(pi, root, "session-1", "/outside/AGENTS.md");
		assert.equal(context.continuationArtifactPath, buildContinuationArtifactPath(root, "session-1"));
		assert.equal(context.agentGuidePath, join(root, "AGENTS.md"));
		assert.equal("existingContinuationDoc" in context, false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
