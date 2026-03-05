import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { mountLynq } from "../../src/adapters/hono.js";
import { createMCPServer } from "../../src/core.js";

function createApp(options?: Parameters<typeof mountLynq>[2]) {
	const server = createMCPServer({ name: "test", version: "1.0.0" });
	server.tool("ping", {}, async () => ({
		content: [{ type: "text", text: "pong" }],
	}));
	const app = new Hono();
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

describe("lynq/hono", () => {
	it("mountLynq adds a route that responds", async () => {
		const app = createApp({ allowedHosts: ["localhost"] });
		const res = await app.request("/mcp", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
				Host: "localhost:3000",
			},
			body: JSON.stringify(initBody),
		});
		expect(res.status).toBe(200);
	});

	it("rejects requests with disallowed Host header", async () => {
		const app = createApp({ allowedHosts: ["localhost"] });
		const res = await app.request("/mcp", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
				Host: "evil.com",
			},
			body: JSON.stringify(initBody),
		});
		expect(res.status).toBe(403);
	});

	it("uses custom path", async () => {
		const app = createApp({
			path: "/api/mcp",
			allowedHosts: ["localhost"],
		});
		const res = await app.request("/api/mcp", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
				Host: "localhost",
			},
			body: JSON.stringify(initBody),
		});
		expect(res.status).toBe(200);
	});
});
