import test from "node:test";
import assert from "node:assert/strict";
import { isContinuationPromptUserMessage, sendContinuationPrompt } from "../extensions/continue/src/prompt-dispatch.ts";

test("sendContinuationPrompt queues resume as follow-up when parent is still active", () => {
	const calls = [];
	const pi = {
		sendUserMessage(prompt, options) {
			calls.push({ prompt, options });
		},
	};

	sendContinuationPrompt(pi, "resume now");

	assert.deepEqual(calls, [{ prompt: "resume now", options: { deliverAs: "followUp" } }]);
});

test("isContinuationPromptUserMessage matches only the delivered continuation user prompt", () => {
	assert.equal(isContinuationPromptUserMessage({
		role: "user",
		content: [{ type: "text", text: "resume now" }],
		timestamp: 0,
	}, "resume now"), true);
	assert.equal(isContinuationPromptUserMessage({
		role: "user",
		content: "resume now",
		timestamp: 0,
	}, "resume now"), true);
	assert.equal(isContinuationPromptUserMessage({
		role: "assistant",
		content: [{ type: "text", text: "resume now" }],
		timestamp: 0,
	}, "resume now"), false);
	assert.equal(isContinuationPromptUserMessage({
		role: "user",
		content: [{ type: "text", text: "different" }],
		timestamp: 0,
	}, "resume now"), false);
});
