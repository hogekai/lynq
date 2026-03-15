import { createHmac, timingSafeEqual } from "node:crypto";
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
	return new RegExp(`^${escaped.join("([^/]+)")}$`);
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

export function signState(
	sessionId: string,
	elicitationId: string,
	secret: string,
): string {
	const data = `${sessionId}:${elicitationId}`;
	const sig = createHmac("sha256", secret).update(data).digest("hex");
	return `${data}:${sig}`;
}

export function verifyState(
	state: string,
	secret: string,
): { sessionId: string; elicitationId: string } | null {
	// HMAC-SHA256 hex digest is always 64 chars. Extract sig from the end
	// to handle colons in sessionId or elicitationId safely.
	if (state.length < 66) return null; // minimum: "a:b:" + 64 hex chars
	const sig = state.slice(-64);
	if (state[state.length - 65] !== ":") return null;
	const prefix = state.slice(0, -65);
	const colonIdx = prefix.indexOf(":");
	if (colonIdx < 1) return null;
	const sessionId = prefix.slice(0, colonIdx);
	const elicitationId = prefix.slice(colonIdx + 1);
	if (!elicitationId) return null;
	const expected = createHmac("sha256", secret)
		.update(`${sessionId}:${elicitationId}`)
		.digest("hex");
	try {
		if (!timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex")))
			return null;
	} catch {
		return null;
	}
	return { sessionId, elicitationId };
}

// ── DNS rebinding protection (moved from adapters/shared.ts) ──────────

export function validateHost(
	hostHeader: string | null,
	allowedHosts: string[],
): boolean {
	if (!hostHeader) return false;
	const hostname = hostHeader.replace(/:\d+$/, "");
	return allowedHosts.includes(hostname);
}

export const LOCALHOST_HOSTS = ["localhost", "127.0.0.1", "::1"];

// ── Middleware chain ──────────────────────────────────────────────────

export function buildMiddlewareChain<TResult = CallToolResult>(
	middlewares: ToolMiddleware[],
	c: ToolContext,
	finalHandler: () => Promise<TResult>,
): () => Promise<TResult> {
	const callMiddlewares = middlewares.filter((mw) => mw.onCall);
	const resultMiddlewares = middlewares.filter((mw) => mw.onResult).reverse();
	let index = 0;

	const next = async (): Promise<TResult> => {
		if (index >= callMiddlewares.length) {
			let result = await finalHandler();
			for (const mw of resultMiddlewares) {
				// biome-ignore lint/style/noNonNullAssertion: filtered above to only include middlewares with onResult
				result = (await mw.onResult!(
					result as CallToolResult,
					c,
				)) as Awaited<TResult>;
			}
			return result;
		}
		const mw = callMiddlewares[index++];
		// biome-ignore lint/style/noNonNullAssertion: filtered above to only include middlewares with onCall
		return mw.onCall!(
			c,
			next as () => Promise<CallToolResult>,
		) as Promise<TResult>;
	};

	return next;
}
