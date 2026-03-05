import type { Context, Hono } from "hono";
import type { MCPServer } from "../types.js";
import { LOCALHOST_HOSTS, validateHost } from "./shared.js";

export interface MountOptions {
	/** Route path. Default: "/mcp" */
	path?: string;
	/** Allowed hostnames for DNS rebinding protection. Default: localhost variants. */
	allowedHosts?: string[];
}

export function mountLynq(
	app: Hono,
	server: MCPServer,
	options?: MountOptions,
): void {
	const path = options?.path ?? "/mcp";
	const handler = server.http();
	const allowed = options?.allowedHosts ?? [...LOCALHOST_HOSTS];

	app.use(path, async (c: Context, next) => {
		if (!validateHost(c.req.header("host") ?? null, allowed)) {
			return c.json(
				{
					jsonrpc: "2.0",
					error: { code: -32000, message: "Forbidden" },
					id: null,
				},
				403,
			);
		}
		return next();
	});

	app.all(path, (c: Context) => handler(c.req.raw));
}
