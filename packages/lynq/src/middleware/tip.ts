import type { ToolMiddleware } from "../types.js";

export interface TipOptions {
	/** Middleware name. Default: "tip" */
	name?: string;
	/** Build the tip URL. Receives sessionId. */
	url: (sessionId: string) => string;
	/** Message shown to user. Default: "If this was helpful, consider leaving a tip!" */
	message?: string;
}

export function tip(options: TipOptions): ToolMiddleware {
	const name = options.name ?? "tip";
	const message =
		options.message ?? "If this was helpful, consider leaving a tip!";

	return {
		name,
		onResult(result, c) {
			if (result.isError) return result;

			const tipUrl = options.url(c.sessionId);
			return {
				...result,
				content: [
					...(result.content ?? []),
					{ type: "text" as const, text: `\n\n${message}\n${tipUrl}` },
				],
			};
		},
	};
}
