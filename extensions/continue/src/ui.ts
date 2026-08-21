import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

/** Return whether command handlers may call interactive/RPC UI methods. */
export function commandHasUi(ctx: Pick<ExtensionCommandContext, "hasUI">): boolean {
	return ctx.hasUI;
}
