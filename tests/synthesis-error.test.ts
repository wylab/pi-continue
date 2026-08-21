import test from "node:test";
import assert from "node:assert/strict";
import { SYNTHESIS_ABORT_MESSAGE } from "../extensions/continue/src/synthesis-error.ts";

test("SYNTHESIS_ABORT_MESSAGE uses the fixed hard-fail message", () => {
	assert.equal(SYNTHESIS_ABORT_MESSAGE, "pi-continue could not create a usable handoff, so continuation stopped before resuming.");
});
