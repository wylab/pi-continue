import type { ConfigScope } from "./types.ts";
import type { ContinuationRequestMode } from "./runtime.ts";

export type OperatorAction = "status" | "preview" | "ledger" | "settings" | "reset";
export type FocusActionId = "continue-now" | "queue" | "preview";
export type PaletteActionId = FocusActionId | "status" | "ledger" | "settings-project" | "settings-global" | "reset-project" | "reset-global";

export interface PaletteAction {
	id: PaletteActionId;
	section: "Continue" | "Inspect" | "Configure";
	label: string;
	desc: string;
	effect: string;
}

export interface ContinuePaletteSelection {
	kind: "continue";
	mode: ContinuationRequestMode;
	instructions: string | undefined;
}

export interface OperatorPaletteSelection {
	kind: OperatorAction;
	scope?: ConfigScope;
	instructions?: string;
}

export type ContinuePaletteResult = ContinuePaletteSelection | OperatorPaletteSelection;

export const PALETTE_ACTIONS: PaletteAction[] = [
	{
		id: "continue-now",
		section: "Continue",
		label: "Continue this run now",
		desc: "Save a handoff; resume here.",
		effect: "Stops the current assistant turn if needed before saving the handoff.",
	},
	{
		id: "queue",
		section: "Continue",
		label: "Continue when idle",
		desc: "Wait for Pi to finish first.",
		effect: "Current tools keep running; the handoff waits for idle.",
	},
	{
		id: "preview",
		section: "Inspect",
		label: "Preview handoff",
		desc: "Show prompts; do not run.",
		effect: "Opens a read-only handoff prompt preview.",
	},
	{
		id: "status",
		section: "Inspect",
		label: "Continuation status",
		desc: "Show latest run and settings.",
		effect: "Opens a read-only status panel.",
	},
	{
		id: "ledger",
		section: "Inspect",
		label: "Show ledger",
		desc: "Open latest Continuation Ledger.",
		effect: "Temporary panel; no transcript entry is appended.",
	},
	{
		id: "settings-project",
		section: "Configure",
		label: "Project settings",
		desc: "Edit repo settings and trigger.",
		effect: "Writes project settings or handoff trigger on change.",
	},
	{
		id: "settings-global",
		section: "Configure",
		label: "Global settings",
		desc: "Edit shared settings and trigger.",
		effect: "Writes global settings or handoff trigger on change.",
	},
	{
		id: "reset-project",
		section: "Configure",
		label: "Reset project",
		desc: "Remove repo settings.",
		effect: "Repo falls back to global/default settings.",
	},
	{
		id: "reset-global",
		section: "Configure",
		label: "Reset global",
		desc: "Remove shared settings.",
		effect: "Projects fall back to package defaults.",
	},
];

export function isFocusActionId(actionId: PaletteActionId): actionId is FocusActionId {
	return actionId === "continue-now" || actionId === "queue" || actionId === "preview";
}

export function actionById(actionId: PaletteActionId): PaletteAction | undefined {
	return PALETTE_ACTIONS.find((action) => action.id === actionId);
}

export function selectionFor(action: PaletteAction, instructions: string | undefined): ContinuePaletteResult {
	const trimmed = instructions?.trim();
	const focus = trimmed && trimmed.length > 0 ? trimmed : undefined;
	if (action.id === "continue-now") return { kind: "continue", mode: "steer", instructions: focus };
	if (action.id === "queue") return { kind: "continue", mode: "queue", instructions: focus };
	if (action.id === "preview") return { kind: "preview", instructions: focus };
	if (action.id === "ledger") return { kind: "ledger" };
	if (action.id === "settings-project") return { kind: "settings", scope: "project" };
	if (action.id === "settings-global") return { kind: "settings", scope: "global" };
	if (action.id === "reset-project") return { kind: "reset", scope: "project" };
	if (action.id === "reset-global") return { kind: "reset", scope: "global" };
	return { kind: "status" };
}
