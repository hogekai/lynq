import type {
	Express,
	Request as ExpressReq,
	Response as ExpressRes,
} from "express";
import type { MCPServer } from "../types.js";
import { LOCALHOST_HOSTS, validateHost } from "./shared.js";

export interface MountOptions {
	/** Route path. Default: "/mcp" */
	path?: string;
	/** Allowed hostnames for DNS rebinding protection. Default: localhost variants. */
	allowedHosts?: string[];
}

function toWebRequest(req: ExpressReq): Request {
	const protocol = req.protocol || "http";
	const host = req.headers.host || "localhost";
	const url = `${protocol}://${host}${req.originalUrl}`;

	const headers = new Headers();
	for (const [key, value] of Object.entries(req.headers)) {
		if (value) {
			headers.set(key, Array.isArray(value) ? value.join(", ") : value);
		}
	}

	const init: RequestInit = { method: req.method, headers };
	if (req.method !== "GET" && req.method !== "HEAD") {
		// Re-serialize pre-parsed body for Web Standard Request
		init.body = JSON.stringify(req.body);
	}
	return new Request(url, init);
}

async function sendWebResponse(
	res: ExpressRes,
	webRes: Response,
): Promise<void> {
	res.status(webRes.status);
	webRes.headers.forEach((value, key) => res.setHeader(key, value));

	if (webRes.body) {
		const reader = webRes.body.getReader();
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				res.write(value);
			}
		} finally {
			res.end();
		}
	} else {
		res.end();
	}
}

export function mountLynq(
	app: Express,
	server: MCPServer,
	options?: MountOptions,
): void {
	const path = options?.path ?? "/mcp";
	const handler = server.http();
	const allowed = options?.allowedHosts ?? [...LOCALHOST_HOSTS];

	app.use(path, (req, res, next) => {
		if (!validateHost(req.headers.host ?? null, allowed)) {
			res.status(403).json({
				jsonrpc: "2.0",
				error: { code: -32000, message: "Forbidden" },
				id: null,
			});
			return;
		}
		next();
	});

	app.all(path, async (req, res) => {
		const webReq = toWebRequest(req);
		const webRes = await handler(webReq);
		await sendWebResponse(res, webRes);
	});
}
