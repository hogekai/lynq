import {
	type ZodRawShapeCompat,
	normalizeObjectSchema,
} from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { InternalResource } from "./internal-types.js";
import type { ToolContext, ToolInfo, ToolMiddleware } from "./types.js";

export function inputToJsonSchema(input: unknown): Record<string, unknown> {
	if (input == null) return { type: "object" };
	const normalized = normalizeObjectSchema(input as ZodRawShapeCompat);
	return normalized
		? (toJsonSchemaCompat(normalized) as Record<string, unknown>)
		: (input as Record<string, unknown>);
}

export function parseMiddlewareArgs(
	label: string,
	args: unknown[],
	// biome-ignore lint/complexity/noBannedTypes: handler type is narrowed by each caller
): { middlewares: ToolMiddleware[]; config: unknown; handler: Function } {
	const handler = args[args.length - 1];
	if (typeof handler !== "function") {
		throw new TypeError(`${label}: last argument must be a handler function`);
	}
	const config = args[args.length - 2];
	if (config == null || typeof config !== "object" || Array.isArray(config)) {
		throw new TypeError(
			`${label}: second-to-last argument must be a config object`,
		);
	}
	const mws = args.slice(0, -2);
	for (const mw of mws) {
		if (
			!mw ||
			typeof mw !== "object" ||
			typeof (mw as Record<string, unknown>).name !== "string"
		) {
			throw new TypeError(
				`${label}: each middleware must have a "name" property`,
			);
		}
	}
	return { middlewares: mws as ToolMiddleware[], config, handler };
}

export function cacheHiddenMiddlewares(
	info: ToolInfo,
	middlewares: ToolMiddleware[],
): string[] {
	const hidden: string[] = [];
	for (const mw of middlewares) {
		if (mw.onRegister?.(info) === false) {
			hidden.push(mw.name);
		}
	}
	return hidden;
}

export function buildTemplatePattern(uri: string): RegExp {
	// Replace {variable} placeholders first, then escape the rest
	const parts = uri.split(/\{[^}]+\}/);
	const escaped = parts.map((p) => p.replace(/[.*+?^$|()[\]\\]/g, "\\$&"));
	return new RegExp(`^${escaped.join("(.+)")}$`);
}

export function isVisible(
	hiddenByMiddlewares: string[],
	key: string,
	overrides: Map<string, "enabled" | "disabled">,
	grants: Set<string>,
): boolean {
	const override = overrides.get(key);
	if (override === "disabled") return false;
	if (override === "enabled") return true;
	for (const mwName of hiddenByMiddlewares) {
		if (!grants.has(mwName)) return false;
	}
	return true;
}

export function findResourceByUri(
	resources: Map<string, InternalResource>,
	uri: string,
): InternalResource | undefined {
	// Exact match first (static resources)
	const exact = resources.get(uri);
	if (exact) return exact;

	// Template match
	for (const res of resources.values()) {
		if (res.isTemplate && res.uriPattern?.test(uri)) {
			return res;
		}
	}

	return undefined;
}

export function buildMiddlewareChain(
	middlewares: ToolMiddleware[],
	ctx: ToolContext,
	finalHandler: () => Promise<CallToolResult>,
): () => Promise<CallToolResult> {
	const callMiddlewares = middlewares.filter((mw) => mw.onCall);
	const resultMiddlewares = middlewares.filter((mw) => mw.onResult).reverse();
	let index = 0;

	const next = async (): Promise<CallToolResult> => {
		if (index >= callMiddlewares.length) {
			let result = await finalHandler();
			for (const mw of resultMiddlewares) {
				// biome-ignore lint/style/noNonNullAssertion: filtered above to only include middlewares with onResult
				result = await mw.onResult!(result, ctx);
			}
			return result;
		}
		const mw = callMiddlewares[index++];
		// biome-ignore lint/style/noNonNullAssertion: filtered above to only include middlewares with onCall
		return mw.onCall!(ctx, next);
	};

	return next;
}
