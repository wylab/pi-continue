import type { UserMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Queue the continuation resume prompt safely if the parent agent is still settling. */
export function sendContinuationPrompt(pi: ExtensionAPI, prompt: string): void {
	pi.sendUserMessage(prompt, { deliverAs: "followUp" });
}

function isUserMessage(message: unknown): message is UserMessage {
	if (typeof message !== "object" || message === null || !("role" in message) || message.role !== "user") return false;
	if (!("content" in message)) return false;
	return typeof message.content === "string" || Array.isArray(message.content);
}

function isTextContentPart(value: unknown): value is { type: "text"; text: string } {
	return typeof value === "object"
		&& value !== null
		&& "type" in value
		&& value.type === "text"
		&& "text" in value
		&& typeof value.text === "string";
}

function userMessageText(message: UserMessage): string {
	if (typeof message.content === "string") return message.content;
	return message.content
		.filter(isTextContentPart)
		.map((part) => part.text)
		.join("\n");
}

/** Return true only for the delivered user message that starts the continuation resume turn. */
export function isContinuationPromptUserMessage(message: unknown, prompt: string): boolean {
	return isUserMessage(message) && userMessageText(message) === prompt;
}
