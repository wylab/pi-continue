import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { patchPiCompactionSettings, readEffectivePiCompactionSettings, readPiCompactionSettingsForScope } from "../extensions/continue/src/pi-settings.ts";

async function withTempAgent(work) {
	const root = mkdtempSync(join(tmpdir(), "pi-continue-settings-"));
	const previousCodingAgentDir = process.env.PI_CODING_AGENT_DIR;
	const previousAgentDir = process.env.PI_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = join(root, "agent");
	delete process.env.PI_AGENT_DIR;
	try {
		return await work(root);
	} finally {
		if (previousCodingAgentDir === undefined) {
			delete process.env.PI_CODING_AGENT_DIR;
		} else {
			process.env.PI_CODING_AGENT_DIR = previousCodingAgentDir;
		}
		if (previousAgentDir === undefined) {
			delete process.env.PI_AGENT_DIR;
		} else {
			process.env.PI_AGENT_DIR = previousAgentDir;
		}
		rmSync(root, { recursive: true, force: true });
	}
}

test("readEffectivePiCompactionSettings defaults to Pi core compaction settings", async () => {
	await withTempAgent(async (root) => {
		assert.deepEqual(readEffectivePiCompactionSettings(root), {
			enabled: true,
			reserveTokens: 16384,
			keepRecentTokens: 20000,
		});
	});
});

test("readEffectivePiCompactionSettings lets project settings override Pi core defaults", async () => {
	await withTempAgent(async (root) => {
		const settingsDir = join(root, ".pi");
		mkdirSync(settingsDir, { recursive: true });
		writeFileSync(
			join(settingsDir, "settings.json"),
			JSON.stringify({ compaction: { enabled: false, reserveTokens: 12345, keepRecentTokens: 6789 } }),
			"utf8",
		);
		assert.deepEqual(readEffectivePiCompactionSettings(root), {
			enabled: false,
			reserveTokens: 12345,
			keepRecentTokens: 6789,
		});
	});
});

test("readEffectivePiCompactionSettings rejects malformed Pi settings", async () => {
	await withTempAgent(async (root) => {
		const settingsDir = join(root, ".pi");
		mkdirSync(settingsDir, { recursive: true });
		writeFileSync(join(settingsDir, "settings.json"), "{", "utf8");
		assert.throws(() => readEffectivePiCompactionSettings(root), /Failed to read Pi settings/);
	});
});

test("readPiCompactionSettingsForScope keeps global values independent of project overrides", async () => {
	await withTempAgent(async (root) => {
		const agentDir = join(root, "agent");
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ compaction: { reserveTokens: 45000 } }), "utf8");
		const settingsDir = join(root, ".pi");
		mkdirSync(settingsDir, { recursive: true });
		writeFileSync(join(settingsDir, "settings.json"), JSON.stringify({ compaction: { reserveTokens: 32000 } }), "utf8");
		assert.equal(readPiCompactionSettingsForScope("global", root).reserveTokens, 45000);
		assert.equal(readPiCompactionSettingsForScope("project", root).reserveTokens, 32000);
	});
});

test("patchPiCompactionSettings writes scoped reserveTokens without clobbering other settings", async () => {
	await withTempAgent(async (root) => {
		const agentDir = join(root, "agent");
		mkdirSync(agentDir, { recursive: true });
		await patchPiCompactionSettings("global", root, { reserveTokens: 45000 });
		assert.deepEqual(JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf8")), { compaction: { reserveTokens: 45000 } });
		const settingsDir = join(root, ".pi");
		mkdirSync(settingsDir, { recursive: true });
		writeFileSync(join(settingsDir, "settings.json"), JSON.stringify({ theme: "light", compaction: { enabled: false, keepRecentTokens: 7777 } }), "utf8");
		await patchPiCompactionSettings("project", root, { reserveTokens: 32000 });
		const written = JSON.parse(readFileSync(join(settingsDir, "settings.json"), "utf8"));
		assert.deepEqual(written, {
			theme: "light",
			compaction: { enabled: false, keepRecentTokens: 7777, reserveTokens: 32000 },
		});
		assert.deepEqual(readEffectivePiCompactionSettings(root), {
			enabled: false,
			reserveTokens: 32000,
			keepRecentTokens: 7777,
		});
	});
});

test("patchPiCompactionSettings removes a scoped reserveTokens override", async () => {
	await withTempAgent(async (root) => {
		const agentDir = join(root, "agent");
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ compaction: { reserveTokens: 45000 } }), "utf8");
		const settingsDir = join(root, ".pi");
		mkdirSync(settingsDir, { recursive: true });
		writeFileSync(join(settingsDir, "settings.json"), JSON.stringify({ compaction: { reserveTokens: 32000, keepRecentTokens: 7777 } }), "utf8");
		await patchPiCompactionSettings("project", root, { reserveTokens: null });
		const written = JSON.parse(readFileSync(join(settingsDir, "settings.json"), "utf8"));
		assert.deepEqual(written, { compaction: { keepRecentTokens: 7777 } });
		assert.deepEqual(readEffectivePiCompactionSettings(root), {
			enabled: true,
			reserveTokens: 45000,
			keepRecentTokens: 7777,
		});
	});
});

test("patchPiCompactionSettings rejects invalid writes without replacing malformed compaction settings", async () => {
	await withTempAgent(async (root) => {
		const settingsDir = join(root, ".pi");
		mkdirSync(settingsDir, { recursive: true });
		const settingsPath = join(settingsDir, "settings.json");
		writeFileSync(settingsPath, JSON.stringify({ compaction: [] }), "utf8");
		await assert.rejects(
			() => patchPiCompactionSettings("project", root, { reserveTokens: 32000 }),
			/compaction must be a JSON object/,
		);
		assert.deepEqual(JSON.parse(readFileSync(settingsPath, "utf8")), { compaction: [] });
		await assert.rejects(
			() => patchPiCompactionSettings("global", root, { reserveTokens: Number.MAX_SAFE_INTEGER + 1 }),
			/positive safe integer/,
		);
	});
});
