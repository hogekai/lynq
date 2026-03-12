import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { error } from "../response.js";
import type { ToolMiddleware } from "../types.js";

export interface RetryOptions {
	/** Maximum number of attempts (including the first). Default: 3. */
	max?: number;
	/** Backoff strategy. Default: "exponential". */
	backoff?: "exponential" | "linear" | "none";
	/** Base delay in milliseconds. Default: 1000. */
	delayMs?: number;
	/** Custom retry condition. Default: retries on `isError: true`. */
	shouldRetry?: (result: CallToolResult) => boolean;
}

export function retry(options?: RetryOptions): ToolMiddleware {
	const max = options?.max ?? 3;
	const backoff = options?.backoff ?? "exponential";
	const delayMs = options?.delayMs ?? 1000;
	const shouldRetry = options?.shouldRetry ?? ((r) => r.isError === true);

	return {
		name: "retry",
		async onCall(c, next) {
			let lastResult: CallToolResult | undefined;
			let lastError: unknown;

			for (let attempt = 0; attempt < max; attempt++) {
				if (c.signal.aborted) {
					return lastResult ?? error("Aborted");
				}

				if (attempt > 0) {
					const delay =
						backoff === "exponential"
							? delayMs * 2 ** (attempt - 1)
							: backoff === "linear"
								? delayMs * attempt
								: 0;
					if (delay > 0) {
						await new Promise((r) => setTimeout(r, delay));
					}
				}

				try {
					const result = await next();
					if (!shouldRetry(result)) return result;
					lastResult = result;
					lastError = undefined;
				} catch (err) {
					lastError = err;
					lastResult = undefined;
				}
			}

			if (lastError) throw lastError;
			// biome-ignore lint/style/noNonNullAssertion: lastResult is always set when lastError is undefined and loop ran at least once
			return lastResult!;
		},
	};
}
