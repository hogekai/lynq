import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolMiddleware } from "../types.js";

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	const obj = value as Record<string, unknown>;
	const keys = Object.keys(obj).sort();
	return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export interface CacheOptions {
	/** TTL in seconds. */
	ttl: number;
	/** Custom cache key builder. Default: `cache:${toolName}:${stableStringify(args)}`. */
	key?: (toolName: string, args: Record<string, unknown>) => string;
}

export function cache(options: CacheOptions): ToolMiddleware {
	const { ttl } = options;
	const buildKey =
		options.key ??
		((name: string, args: Record<string, unknown>) =>
			`cache:${name}:${stableStringify(args)}`);

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
