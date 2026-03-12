import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolMiddleware } from "../types.js";

export interface CacheOptions {
	/** TTL in seconds. */
	ttl: number;
	/** Custom cache key builder. Default: `cache:${toolName}:${JSON.stringify(args)}`. */
	key?: (toolName: string, args: Record<string, unknown>) => string;
}

export function cache(options: CacheOptions): ToolMiddleware {
	const { ttl } = options;
	const buildKey =
		options.key ??
		((name: string, args: Record<string, unknown>) =>
			`cache:${name}:${JSON.stringify(args)}`);

	return {
		name: "cache",
		async onCall(c, next) {
			const key = buildKey(c.toolName, c.args);
			const cached = await c.store.get<CallToolResult>(key);
			if (cached) return cached;
			return next();
		},
		async onResult(result, c) {
			if (!result.isError) {
				const key = buildKey(c.toolName, c.args);
				await c.store.set(key, result, ttl);
			}
			return result;
		},
	};
}
