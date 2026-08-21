const ANSI_PREFIX_PATTERN = /^\u001b(?:\[[0-9;?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\)|_[^\u0007]*\u0007)/;
const ANSI_GLOBAL_PATTERN = /\u001b(?:\[[0-9;?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\)|_[^\u0007]*\u0007)/g;

function charWidth(char: string): number {
	const code = char.codePointAt(0);
	if (code === undefined || code === 0) return 0;
	if (code < 32 || (code >= 0x7f && code < 0xa0)) return 0;
	if (
		(code >= 0x0300 && code <= 0x036f) ||
		(code >= 0x1ab0 && code <= 0x1aff) ||
		(code >= 0x1dc0 && code <= 0x1dff) ||
		(code >= 0x20d0 && code <= 0x20ff) ||
		(code >= 0xfe00 && code <= 0xfe0f) ||
		(code >= 0xfe20 && code <= 0xfe2f) ||
		code === 0x200d
	) {
		return 0;
	}
	if (
		(code >= 0x1100 && code <= 0x115f) ||
		code === 0x2329 ||
		code === 0x232a ||
		(code >= 0x2e80 && code <= 0xa4cf) ||
		(code >= 0xac00 && code <= 0xd7a3) ||
		(code >= 0xf900 && code <= 0xfaff) ||
		(code >= 0xfe10 && code <= 0xfe19) ||
		(code >= 0xfe30 && code <= 0xfe6f) ||
		(code >= 0xff00 && code <= 0xff60) ||
		(code >= 0xffe0 && code <= 0xffe6) ||
		(code >= 0x1f300 && code <= 0x1faff) ||
		(code >= 0x20000 && code <= 0x3fffd)
	) {
		return 2;
	}
	return 1;
}

/** Strip ANSI escape sequences and Pi TUI cursor markers. */
export function stripAnsi(value: string): string {
	return value.replace(ANSI_GLOBAL_PATTERN, "");
}

/** Return an approximate terminal display width without requiring runtime TUI imports. */
export function visibleWidth(value: string): number {
	let width = 0;
	for (const char of stripAnsi(value)) width += charWidth(char);
	return width;
}

/** Truncate styled text to a display width while preserving ANSI escape sequences. */
export function truncateAnsi(value: string, maxWidth: number): string {
	if (maxWidth <= 0) return "";
	if (visibleWidth(value) <= maxWidth) return value;
	const ellipsis = maxWidth > 3 ? "..." : "";
	const limit = maxWidth - ellipsis.length;
	let width = 0;
	let output = "";
	for (let index = 0; index < value.length;) {
		const ansiMatch = value.slice(index).match(ANSI_PREFIX_PATTERN);
		if (ansiMatch) {
			output += ansiMatch[0];
			index += ansiMatch[0].length;
			continue;
		}
		const char = Array.from(value.slice(index))[0] ?? "";
		const nextWidth = charWidth(char);
		if (width + nextWidth > limit) break;
		output += char;
		width += nextWidth;
		index += char.length;
	}
	return `${output}${ellipsis}`;
}

export function padVisible(value: string, width: number): string {
	const length = visibleWidth(value);
	return `${value}${" ".repeat(Math.max(0, width - length))}`;
}
