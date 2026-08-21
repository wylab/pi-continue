import type { ContinuationRequestMode } from "./runtime.ts";

export type ContinueOperatorSubcommandName = "status" | "settings" | "reset" | "preview" | "ledger";

export interface ContinueOperatorSubcommand {
	name: ContinueOperatorSubcommandName;
	rest: string | undefined;
}

const OPERATOR_SUBCOMMANDS = new Set<string>(["status", "settings", "reset", "preview", "ledger"]);

function isOperatorSubcommandName(name: string): name is ContinueOperatorSubcommandName {
	return OPERATOR_SUBCOMMANDS.has(name);
}

/** Return whether exact /continue should open the interactive action palette. */
export function shouldOpenContinuePalette(args: string | undefined, hasUI: boolean): boolean {
	return hasUI && (args?.trim() ?? "").length === 0;
}

/** Split typed /continue operator shortcuts from continuation focus text. */
export function splitContinueSubcommand(args: string | undefined): ContinueOperatorSubcommand | undefined {
	const trimmed = args?.trim() ?? "";
	if (!trimmed) return undefined;
	const spaceIndex = trimmed.search(/\s/);
	const name = (spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex)).toLowerCase();
	if (!isOperatorSubcommandName(name)) return undefined;
	const rest = spaceIndex === -1 ? "" : trimmed.slice(spaceIndex + 1).trim();
	return { name, rest: rest.length > 0 ? rest : undefined };
}

/** Build the typed shortcut form used by palette selections to reach the runtime owner. */
export function buildContinuationCommandArgs(mode: ContinuationRequestMode, instructions: string | undefined): string {
	const trimmed = instructions?.trim();
	return trimmed && trimmed.length > 0 ? `${mode} ${trimmed}` : mode;
}
