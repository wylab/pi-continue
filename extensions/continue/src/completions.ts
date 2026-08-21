interface CompletionItem {
	value: string;
	label: string;
	description?: string;
}

interface CommandCompletion {
	name: string;
	description: string;
}

const TOP_LEVEL_COMMANDS: CommandCompletion[] = [
	{
		name: "steer",
		description: "Continue this run now: save a handoff and resume in this session, stopping active work only if needed.",
	},
	{
		name: "queue",
		description: "Continue when idle: wait for Pi to finish current work, then save a handoff and resume.",
	},
	{
		name: "preview",
		description: "Preview the handoff prompts before running; optional note text is supported.",
	},
	{
		name: "status",
		description: "Check the latest continuation, current settings, prompt sources, and trigger threshold.",
	},
	{
		name: "ledger",
		description: "Show the latest Continuation Ledger: the handoff saved for this session.",
	},
	{
		name: "settings",
		description: "Edit project or global pi-continue settings and the handoff trigger in the TUI.",
	},
	{
		name: "reset",
		description: "Reset project or global pi-continue settings after confirmation.",
	},
];

const SCOPED_COMMANDS = new Set(["settings", "reset"]);
const SCOPES: CommandCompletion[] = [
	{
		name: "project",
		description: "Use this repository's package config and handoff trigger.",
	},
	{
		name: "global",
		description: "Use global package config and handoff trigger.",
	},
];

function completionFor(command: CommandCompletion, value: string): CompletionItem {
	return {
		value,
		label: command.name,
		description: command.description,
	};
}

function filterCommands(commands: CommandCompletion[], prefix: string, valuePrefix = ""): CompletionItem[] {
	const normalizedPrefix = prefix.toLowerCase();
	return commands
		.filter((command) => command.name.startsWith(normalizedPrefix))
		.map((command) => completionFor(command, `${valuePrefix}${command.name}`));
}

function splitArgumentPrefix(argumentPrefix: string): { leading: string; first: string; rest: string; hasRest: boolean } {
	const leadingTrimmed = argumentPrefix.trimStart();
	const spaceIndex = leadingTrimmed.search(/\s/);
	if (spaceIndex === -1) {
		return {
			leading: leadingTrimmed,
			first: leadingTrimmed.toLowerCase(),
			rest: "",
			hasRest: false,
		};
	}
	const first = leadingTrimmed.slice(0, spaceIndex).toLowerCase();
	return {
		leading: leadingTrimmed,
		first,
		rest: leadingTrimmed.slice(spaceIndex + 1).trimStart(),
		hasRest: true,
	};
}

/** Return argument completions for the single /continue command. */
export function getContinueArgumentCompletions(argumentPrefix: string): CompletionItem[] | null {
	const parts = splitArgumentPrefix(argumentPrefix);
	if (!parts.hasRest) {
		const items = filterCommands(TOP_LEVEL_COMMANDS, parts.leading);
		return items.length > 0 ? items : null;
	}
	if (!SCOPED_COMMANDS.has(parts.first)) return null;
	const items = filterCommands(SCOPES, parts.rest, `${parts.first} `);
	return items.length > 0 ? items : null;
}
