import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import type { ResolvedProjectContext } from "./types.ts";

interface ExecApi {
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<{
		stdout: string;
		code: number;
	}>;
}

const mutationQueues = new Map<string, Promise<void>>();

async function withMutationQueue(path: string, work: () => Promise<void>): Promise<void> {
	const previous = mutationQueues.get(path) ?? Promise.resolve();
	const next = previous.then(work, work);
	mutationQueues.set(path, next);
	try {
		await next;
	} finally {
		if (mutationQueues.get(path) === next) mutationQueues.delete(path);
	}
}

function trimTrailingWhitespace(value: string): string {
	return value
		.replace(/\r\n/g, "\n")
		.split("\n")
		.map((line) => line.replace(/[ \t]+$/g, ""))
		.join("\n")
		.trim();
}

/** Normalize markdown content before diffing or writing. */
export function normalizeMarkdownContent(value: string): string {
	return `${trimTrailingWhitespace(value)}\n`;
}

async function getGitRoot(pi: ExecApi, cwd: string): Promise<string | undefined> {
	const result = await pi.exec("git", ["rev-parse", "--show-toplevel"], { cwd, timeout: 4000 });
	if (result.code !== 0) return undefined;
	const root = result.stdout.trim();
	return root.length > 0 ? root : undefined;
}

export async function resolveProjectRoot(pi: ExecApi, cwd: string): Promise<string> {
	return (await getGitRoot(pi, cwd)) ?? cwd;
}

function sanitizeRepoRelativePath(projectRoot: string, configuredPath: string, fallback: string): string {
	const trimmed = normalize(configuredPath.trim()).replace(/^\.\//, "");
	if (trimmed.length === 0) return fallback;
	if (isAbsolute(trimmed)) return fallback;
	const resolved = resolve(projectRoot, trimmed);
	const rel = relative(projectRoot, resolved);
	if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`)) return fallback;
	return trimmed;
}

function readOptionalFile(path: string): string | undefined {
	return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

export function encodeSessionIdForArtifactPath(sessionId: string): string {
	const encoded = Buffer.from(sessionId, "utf8").toString("base64url");
	return encoded.length > 0 ? encoded : "empty-session-id";
}

export function buildContinuationArtifactPath(projectRoot: string, sessionId: string): string {
	return join(projectRoot, ".pi", "continue", `${encodeSessionIdForArtifactPath(sessionId)}.md`);
}

/** Resolve the project root, package-owned continuation artifact path, and configured agent guide. */
export async function resolveProjectContext(
	pi: ExecApi,
	cwd: string,
	sessionId: string,
	configuredAgentGuidePath = "AGENTS.md",
): Promise<ResolvedProjectContext> {
	const projectRoot = await resolveProjectRoot(pi, cwd);
	const repoRelativeAgentGuidePath = sanitizeRepoRelativePath(projectRoot, configuredAgentGuidePath, "AGENTS.md");
	const agentGuidePath = join(projectRoot, repoRelativeAgentGuidePath);
	return {
		projectRoot,
		continuationArtifactPath: buildContinuationArtifactPath(projectRoot, sessionId),
		agentGuidePath,
		existingAgentGuide: readOptionalFile(agentGuidePath),
	};
}

/** Write a normalized Markdown file only when normalized content changes. */
export async function writeNormalizedMarkdownFile(path: string, content: string): Promise<"updated" | "unchanged"> {
	const normalized = normalizeMarkdownContent(content);
	const existing = existsSync(path) ? readFileSync(path, "utf8") : undefined;
	if (existing !== undefined && normalizeMarkdownContent(existing) === normalized) {
		return "unchanged";
	}
	await withMutationQueue(path, async () => {
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, normalized, "utf8");
	});
	return "updated";
}
