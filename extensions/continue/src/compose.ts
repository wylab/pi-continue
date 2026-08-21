import { renderContinuationDetails } from "./details.ts";
import type { ContinuationCompactionDetails } from "./types.ts";

function escapeTaggedContent(content: string): string {
	return content
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function renderBlock(tag: string, content: string): string {
	return `<${tag}>\n${escapeTaggedContent(content.trim())}\n</${tag}>`;
}

function renderFileListTag(tag: string, values: string[]): string | undefined {
	if (values.length === 0) return undefined;
	return renderBlock(tag, values.join("\n"));
}

/** Render the compaction summary that Pi persists in session history. */
export function composeCompactionSummary(
	continuation: string,
	details: ContinuationCompactionDetails,
	options: { appendCompactionMetadata: boolean; appendReadFileTags: boolean; appendModifiedFileTags: boolean },
): string {
	const parts = [renderBlock("continuation", continuation)];
	if (options.appendCompactionMetadata) {
		parts.push(renderContinuationDetails(details));
	}
	if (options.appendReadFileTags) {
		const readFiles = renderFileListTag("read-files", details.readFiles);
		if (readFiles) parts.push(readFiles);
	}
	if (options.appendModifiedFileTags) {
		const modifiedFiles = renderFileListTag("modified-files", details.modifiedFiles);
		if (modifiedFiles) parts.push(modifiedFiles);
	}
	return `${parts.join("\n\n")}\n`;
}
