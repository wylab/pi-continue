import test from "node:test";
import assert from "node:assert/strict";
import { endsWithCompleteToolResultBatch, toolResultIdsMatchAssistant } from "../extensions/continue/src/tool-batches.ts";

function assistantMessage(...toolCallIds: string[]) {
	return {
		role: "assistant",
		content: toolCallIds.map((id) => ({ type: "toolCall", id, name: "read", arguments: { path: `/repo/${id}.ts` } })),
	};
}

function toolResultMessage(toolCallId: string) {
	return {
		role: "toolResult",
		toolCallId,
		toolName: "read",
		content: [{ type: "text", text: "file" }],
		isError: false,
	};
}

test("toolResultIdsMatchAssistant compares exact ID sets without separator collisions", () => {
	assert.equal(
		toolResultIdsMatchAssistant(
			[toolResultMessage("a"), toolResultMessage("b\nc")],
			assistantMessage("a\nb", "c"),
		),
		false,
	);
	assert.equal(
		toolResultIdsMatchAssistant(
			[toolResultMessage("c"), toolResultMessage("a\nb")],
			assistantMessage("a\nb", "c"),
		),
		true,
	);
});

test("complete tool-result batches fail closed on malformed provider-relevant message shape", () => {
	const malformedAssistantToolCall = {
		role: "assistant",
		content: [{ type: "toolCall", id: "call-a", arguments: { path: "/repo/a.ts" } }],
	};
	const malformedToolResult = {
		role: "toolResult",
		toolCallId: "call-a",
		toolName: "read",
		content: [{ type: "text", text: "file" }],
	};
	assert.equal(endsWithCompleteToolResultBatch([malformedAssistantToolCall, toolResultMessage("call-a")]), false);
	assert.equal(endsWithCompleteToolResultBatch([assistantMessage("call-a"), malformedToolResult]), false);
});
