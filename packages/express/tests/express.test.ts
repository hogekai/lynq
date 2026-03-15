import { createMCPServer, text } from "@lynq/lynq";
import express from "express";
import { describe, expect, it } from "vitest";
import { mountLynq } from "../src/index.js";

function createApp(options?: Parameters<typeof mountLynq>[2]) {
	const server = createMCPServer({ name: "test", version: "1.0.0" });
	server.tool("ping", {}, async () => text("pong"));
	const app = express();
	app.use(express.json());
	mountLynq(app, server, options);
	return app;
}

const initBody = {
	jsonrpc: "2.0",
	method: "initialize",
	params: {
		protocolVersion: "2025-03-26",
		capabilities: {},
		clientInfo: { name: "test", version: "1.0.0" },
	},
	id: 1,
};

async function request(
	app: express.Express,
	path: string,
	options: { host?: string; body?: unknown },
): Promise<{ status: number; body: string }> {
	return new Promise((resolve, reject) => {
		const server = app.listen(0, () => {
			const addr = server.address();
			if (!addr || typeof addr === "string") {
				server.close();
				return reject(new Error("Failed to get port"));
			}
			const url = `http://127.0.0.1:${addr.port}${path}`;
			fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json, text/event-stream",
					Host: options.host ?? "localhost",
				},
				body: JSON.stringify(options.body),
			})
				.then(async (res) => {
					const body = await res.text().catch(() => "");
					server.close();
					resolve({ status: res.status, body });
				})
				.catch((err) => {
					server.close();
					reject(err);
				});
		});
	});
}

describe("@lynq/express", () => {
	it("mountLynq adds a route that responds", async () => {
		const app = createApp({ allowedHosts: ["127.0.0.1", "localhost"] });
		const res = await request(app, "/mcp", {
			host: "127.0.0.1",
			body: initBody,
		});
		expect(res.status).toBe(200);
	});

	it("rejects requests with disallowed Host header", async () => {
		const app = createApp({ allowedHosts: ["localhost"] });
		const res = await request(app, "/mcp", {
			host: "evil.com",
			body: initBody,
		});
		expect(res.status).toBe(403);
	});

	it("uses custom path", async () => {
		const app = createApp({
			path: "/api/mcp",
			allowedHosts: ["127.0.0.1", "localhost"],
		});
		const res = await request(app, "/api/mcp", {
			host: "127.0.0.1",
			body: initBody,
		});
		expect(res.status).toBe(200);
	});

	it("accepts custom allowedHosts", async () => {
		const app = createApp({
			allowedHosts: ["my-server.example.com", "127.0.0.1"],
		});
		const res = await request(app, "/mcp", {
			host: "my-server.example.com",
			body: initBody,
		});
		expect(res.status).toBe(200);
	});
});
