import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

interface PiInternals {
	prepareCompaction: (entries: unknown[], settings: { enabled: boolean; reserveTokens: number; keepRecentTokens: number }) => unknown;
	estimateTokens: (message: unknown) => number;
	estimateContextTokens: (messages: unknown[]) => {
		tokens: number;
		usageTokens: number;
		trailingTokens: number;
		lastUsageIndex: number | null;
	};
	convertToLlm: (messages: unknown[]) => unknown[];
	serializeConversation: (messages: unknown[]) => string;
}

let cachedInternals: Promise<PiInternals> | undefined;

/**
 * Resolve the host package entry regardless of the loader's import.meta shim.
 * Pi's production loader (jiti-static with aliases) resolves import.meta.resolve
 * successfully; CJS-interop loaders (e.g. tsx in CJS mode) shim import.meta WITHOUT
 * resolve, which would silently kill loadPiInternals - and therefore the mid-run
 * guard AND the proactive absolute-threshold trigger. Three strategies:
 * 1. Loader-provided import.meta.resolve (jiti native ESM, Node >= 20.6, Bun).
 * 2. Subprocess probe of the same runtime: the child gets the platform's native
 *    import.meta.resolve, unaffected by the parent's shim.
 * 3. Known-install-location probe (global npm prefixes + the user npm prefix).
 * Cached once via cachedInternals.
 */
function resolveHostPackageEntry(): string {
	const specifier = "@earendil-works/pi-coding-agent";
	if (typeof import.meta.resolve === "function") {
		try {
			return import.meta.resolve(specifier);
		} catch {
			// continue
		}
	}
	try {
		const probe = `console.log(import.meta.resolve(${JSON.stringify(specifier)}, ${JSON.stringify(import.meta.url)}))`;
		const output = execFileSync(process.execPath, ["--input-type=module", "-e", probe], { encoding: "utf8", timeout: 10_000 }).trim();
		const url = output.split("\n").at(-1) ?? "";
		if (url.startsWith("file:")) return url;
	} catch {
		// continue
	}
	for (const root of [
		"/opt/homebrew/lib/node_modules",
		"/usr/local/lib/node_modules",
		"/usr/lib/node_modules",
		join(homedir(), ".pi", "agent", "npm", "node_modules"),
	]) {
		try {
			const candidate = join(root, "@earendil-works", "pi-coding-agent");
			const pkg = JSON.parse(readFileSync(join(candidate, "package.json"), "utf8")) as { main?: string };
			const entryPath = join(candidate, pkg.main ?? "dist/index.js");
			if (existsSync(entryPath)) return pathToFileURL(entryPath).href;
		} catch {
			// continue
		}
	}
	throw new Error(`Could not resolve ${specifier}`);
}

/** Resolve Pi internal compaction helpers from the installed package at runtime. */
export async function loadPiInternals(): Promise<PiInternals> {
	if (!cachedInternals) {
		cachedInternals = (async () => {
			const packageEntryUrl = resolveHostPackageEntry();
			const distRoot = dirname(fileURLToPath(packageEntryUrl));
			const [compactionModule, messagesModule, utilsModule] = await Promise.all([
				import(pathToFileURL(join(distRoot, "core", "compaction", "compaction.js")).href),
				import(pathToFileURL(join(distRoot, "core", "messages.js")).href),
				import(pathToFileURL(join(distRoot, "core", "compaction", "utils.js")).href),
			]);
			return {
				prepareCompaction: compactionModule.prepareCompaction,
				estimateTokens: compactionModule.estimateTokens,
				estimateContextTokens: compactionModule.estimateContextTokens,
				convertToLlm: messagesModule.convertToLlm,
				serializeConversation: utilsModule.serializeConversation,
			};
		})();
	}
	return cachedInternals;
}
