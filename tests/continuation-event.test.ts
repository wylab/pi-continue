import test from "node:test";
import assert from "node:assert/strict";
import {
	abandonActiveContinuationEvent,
	beginContinuationEvent,
	failPendingOutputWritesForEvent,
	finishContinuationEvent,
	isLatestContinuationEvent,
	planActiveOutputWrites,
	markContinuationPromptSent,
	markContinuationResumeStarted,
	recordActiveSynthesisTelemetry,
	recordOutputWriteResult,
	settleContinuationResume,
} from "../extensions/continue/src/continuation-event.ts";
import type { ContinuationEventStore } from "../extensions/continue/src/types.ts";

function createStore(): ContinuationEventStore {
	return {
		latestEvent: undefined,
		activeEventId: undefined,
		nextEventSequence: 0,
	};
}

test("event failure reasons are owned messages supplied by the caller", () => {
	const store = createStore();
	const event = beginContinuationEvent(store, "command-steer", undefined, "pending");
	assert.equal(finishContinuationEvent(store, event.id, "failed", "Continuation handoff failed."), true);
	assert.equal(store.latestEvent?.failureReason, "Continuation handoff failed.");
});

test("resume outcome completes a running continuation after prompt dispatch", () => {
	const store = createStore();
	const event = beginContinuationEvent(store, "command-steer", undefined, "pending");
	markContinuationPromptSent(store, event.id);
	assert.equal(store.latestEvent?.status, "running");
	assert.equal(store.latestEvent?.resume.status, "pending");
	assert.equal(markContinuationResumeStarted(store, event.id), true);
	assert.equal(store.latestEvent?.resume.status, "running");
	assert.equal(settleContinuationResume(store, event.id, "completed", {
		stopReason: "stop",
		requestedModel: "openai/gpt-test",
		responseModel: "openai/gpt-routed",
	}), true);
	assert.equal(store.activeEventId, undefined);
	assert.equal(store.latestEvent?.status, "completed");
	assert.equal(store.latestEvent?.resume.status, "completed");
	assert.equal(store.latestEvent?.resume.requestedModel, "openai/gpt-test");
	assert.equal(store.latestEvent?.resume.responseModel, "openai/gpt-routed");
});

test("synthesis telemetry records requested and routed summarizer provenance", () => {
	const store = createStore();
	beginContinuationEvent(store, "mid-run-guard", undefined, "pending");
	recordActiveSynthesisTelemetry(store, {
		history: {
			requestedModel: "openai/gpt-test",
			responseModel: "openai/gpt-routed",
			responseId: "resp-1",
			usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 30, costTotal: 0.001 },
			httpStatus: 200,
		},
		totalCost: 0.001,
		totalTokens: 30,
	});
	assert.equal(store.latestEvent?.synthesis?.history?.requestedModel, "openai/gpt-test");
	assert.equal(store.latestEvent?.synthesis?.history?.responseModel, "openai/gpt-routed");
	assert.equal(store.latestEvent?.synthesis?.history?.httpStatus, 200);
	assert.equal(store.latestEvent?.synthesis?.totalTokens, 30);
});

test("output write updates require the matching latest event id", () => {
	const store = createStore();
	const event = beginContinuationEvent(store, "command-steer", undefined, "pending");
	finishContinuationEvent(store, event.id, "completed", undefined);
	recordOutputWriteResult(store, "stale-event", "continuation-artifact", "failed", "stale failure");
	assert.equal(isLatestContinuationEvent(store, "stale-event"), false);
	assert.equal(store.latestEvent?.outputWrites.continuationArtifact, "off");
	assert.equal(store.latestEvent?.failureReason, undefined);
	recordOutputWriteResult(store, event.id, "continuation-artifact", "updated", undefined);
	assert.equal(store.latestEvent?.outputWrites.continuationArtifact, "updated");
});

test("abandonActiveContinuationEvent settles pending writes on shutdown", () => {
	const store = createStore();
	beginContinuationEvent(store, "command-queue", undefined, "pending");
	planActiveOutputWrites(store, {
		continuationArtifact: "pending",
		agentGuide: "pending",
	});
	abandonActiveContinuationEvent(store, "Pi session shut down before continuation finished settling.");
	assert.equal(store.activeEventId, undefined);
	assert.equal(store.latestEvent?.status, "failed");
	assert.equal(store.latestEvent?.outputWrites.continuationArtifact, "failed");
	assert.equal(store.latestEvent?.outputWrites.agentGuide, "failed");
	assert.equal(store.latestEvent?.failureReason, "Pi session shut down before continuation finished settling.");
});

test("abandonActiveContinuationEvent fails pending writes after handoff completion", () => {
	const store = createStore();
	const event = beginContinuationEvent(store, "command-queue", undefined, "pending");
	planActiveOutputWrites(store, {
		continuationArtifact: "pending",
		agentGuide: "off",
	});
	finishContinuationEvent(store, event.id, "completed", undefined);
	abandonActiveContinuationEvent(store, "Pi session shut down before continuation finished settling.");
	assert.equal(store.activeEventId, undefined);
	assert.equal(store.latestEvent?.status, "completed");
	assert.equal(store.latestEvent?.outputWrites.continuationArtifact, "failed");
	assert.equal(store.latestEvent?.outputWrites.agentGuide, "off");
	assert.equal(store.latestEvent?.failureReason, "Pi session shut down before continuation finished settling.");
});

test("finishContinuationEvent does not report handoff failure as failed resume", () => {
	const store = createStore();
	const event = beginContinuationEvent(store, "command-steer", undefined, "pending");
	assert.equal(finishContinuationEvent(store, event.id, "failed", "Continuation handoff failed."), true);
	assert.equal(store.latestEvent?.status, "failed");
	assert.equal(store.latestEvent?.promptStatus, "failed");
	assert.equal(store.latestEvent?.resume.status, "not-requested");
	assert.equal(store.latestEvent?.failureReason, "Continuation handoff failed.");
});

test("finishContinuationEvent is terminal-idempotent", () => {
	const store = createStore();
	const event = beginContinuationEvent(store, "mid-run-guard", undefined, "pending");
	assert.equal(finishContinuationEvent(store, event.id, "failed", "Continuation handoff failed."), true);
	assert.equal(finishContinuationEvent(store, event.id, "completed", undefined), false);
	assert.equal(store.latestEvent?.status, "failed");
	assert.equal(store.latestEvent?.failureReason, "Continuation handoff failed.");
});

test("failPendingOutputWritesForEvent clears pending writes with caller-owned failure copy", () => {
	const store = createStore();
	const event = beginContinuationEvent(store, "command-steer", undefined, "pending");
	planActiveOutputWrites(store, {
		continuationArtifact: "pending",
		agentGuide: "no-replacement",
	});
	failPendingOutputWritesForEvent(store, event.id, "Output write failed; check the configured path and permissions.");
	assert.equal(store.latestEvent?.outputWrites.continuationArtifact, "failed");
	assert.equal(store.latestEvent?.outputWrites.agentGuide, "no-replacement");
	assert.equal(store.latestEvent?.failureReason, "Output write failed; check the configured path and permissions.");
});
