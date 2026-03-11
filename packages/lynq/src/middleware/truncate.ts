import type { ToolMiddleware } from "../types.js";

export interface TruncateOptions {
	/** Maximum characters per text content block. */
	maxChars: number;
	/** Suffix appended when truncated. Default: "..." */
	suffix?: string;
}

export function truncate(options: TruncateOptions): ToolMiddleware {
	const { maxChars } = options;
	const suffix = options.suffix ?? "...";

	return {
		name: "truncate",
		onResult(result) {
			return {
				...result,
				content: (result.content as Array<{ type: string; text?: string }>).map(
					(block) => {
						if (
							block.type === "text" &&
							block.text &&
							block.text.length > maxChars
						) {
							return {
								...block,
								text: block.text.slice(0, maxChars - suffix.length) + suffix,
							};
						}
						return block;
					},
				),
			} as typeof result;
		},
	};
}
