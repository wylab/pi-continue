import test from "node:test";
import assert from "node:assert/strict";
import { padVisible, truncateAnsi, visibleWidth } from "../extensions/continue/src/tui-text.ts";

test("tui text helpers measure ANSI and wide characters", () => {
	assert.equal(visibleWidth("plain"), 5);
	assert.equal(visibleWidth("\u001b[31mred\u001b[0m"), 3);
	assert.equal(visibleWidth("語"), 2);
	assert.equal(visibleWidth("e\u0301"), 1);
});

test("tui text helpers truncate and pad by display width", () => {
	assert.equal(truncateAnsi("abcdef", 5), "ab...");
	assert.equal(truncateAnsi("語abcdef", 5), "語...");
	assert.equal(padVisible("語", 4), "語  ");
});
