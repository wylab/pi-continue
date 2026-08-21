import { homedir } from "node:os";
import { join } from "node:path";

/** Resolve Pi's agent config directory for package config, settings, and prompt overrides. */
export function resolveAgentDir(): string {
	return process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
}
