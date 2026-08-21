import test from "node:test";
import assert from "node:assert/strict";
import { commandHasUi } from "../extensions/continue/src/ui.ts";

test("commandHasUi follows the extension context UI availability boundary", () => {
	assert.equal(commandHasUi({ hasUI: true }), true);
	assert.equal(commandHasUi({ hasUI: false }), false);
});
