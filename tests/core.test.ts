import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../src/core.js";
import type { ToolMiddleware } from "../src/types.js";

function createTestServer() {
	const server = createMCPServer({ name: "test", version: "1.0.0" }) as any;
	return server;
}

describe("createMCPServer", () => {
	it("creates a server instance", () => {
		const server = createTestServer();
		expect(server).toBeDefined();
		expect(server.use).toBeTypeOf("function");
		expect(server.tool).toBeTypeOf("function");
		expect(server.stdio).toBeTypeOf("function");
	});

	it("registers a tool with schema and handler", () => {
		const server = createTestServer();
		server.tool("greet", { name: z.string() }, async (args: any) => ({
			content: [{ type: "text", text: `Hello ${args.name}` }],
		}));
		expect(server._isToolVisible("greet", "default")).toBe(true);
	});

	it("registers a tool with description", () => {
		const server = createTestServer();
		server.tool(
			"greet",
			"Greet someone",
			{ name: z.string() },
			async (args: any) => ({
				content: [{ type: "text", text: `Hello ${args.name}` }],
			}),
		);
		expect(server._isToolVisible("greet", "default")).toBe(true);
	});
});

describe("middleware", () => {
	it("applies global middleware to all tools", () => {
		const server = createTestServer();
		const mw: ToolMiddleware = {
			name: "test-mw",
			onRegister: () => false,
		};
		server.use(mw);
		server.tool("hidden", { name: z.string() }, async () => ({
			content: [{ type: "text", text: "ok" }],
		}));
		expect(server._isToolVisible("hidden", "default")).toBe(false);
	});

	it("applies per-tool middleware", () => {
		const server = createTestServer();
		const mw: ToolMiddleware = {
			name: "guard",
			onRegister: () => false,
		};
		server.tool("guarded", mw, { name: z.string() }, async () => ({
			content: [{ type: "text", text: "ok" }],
		}));
		server.tool("open", { name: z.string() }, async () => ({
			content: [{ type: "text", text: "ok" }],
		}));
		expect(server._isToolVisible("guarded", "default")).toBe(false);
		expect(server._isToolVisible("open", "default")).toBe(true);
	});

	it("executes middleware chain in order: global → per-tool → handler", async () => {
		const server = createTestServer();
		const order: string[] = [];

		const globalMw: ToolMiddleware = {
			name: "global",
			async onCall(ctx, next) {
				order.push("global");
				return next();
			},
		};

		const perToolMw: ToolMiddleware = {
			name: "per-tool",
			async onCall(ctx, next) {
				order.push("per-tool");
				return next();
			},
		};

		server.use(globalMw);
		server.tool("test", perToolMw, { name: z.string() }, async () => {
			order.push("handler");
			return { content: [{ type: "text", text: "ok" }] };
		});

		// Simulate a tools/call by accessing internals
		const session = server._createSessionAPI("test-session");
		const ctx = {
			toolName: "test",
			session,
			signal: AbortSignal.timeout(5000),
			sessionId: "test-session",
		};

		// We need to directly test through the server's request handler
		// Instead, we can connect with a mock transport and send requests
		const { Client } = await import(
			"@modelcontextprotocol/sdk/client/index.js"
		);
		const { InMemoryTransport } = await import(
			"@modelcontextprotocol/sdk/inMemory.js"
		);

		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();

		const client = new Client({ name: "test-client", version: "1.0.0" });

		await Promise.all([
			server._server.connect(serverTransport),
			client.connect(clientTransport),
		]);

		const result = await client.callTool({
			name: "test",
			arguments: { name: "world" },
		});

		expect(order).toEqual(["global", "per-tool", "handler"]);
		expect(result.content).toEqual([{ type: "text", text: "ok" }]);

		await client.close();
	});
});

describe("session", () => {
	it("stores and retrieves session data", () => {
		const server = createTestServer();
		const session = server._createSessionAPI("s1");
		session.set("key", "value");
		expect(session.get("key")).toBe("value");
	});

	it("isolates sessions", () => {
		const server = createTestServer();
		const s1 = server._createSessionAPI("s1");
		const s2 = server._createSessionAPI("s2");
		s1.set("key", "a");
		s2.set("key", "b");
		expect(s1.get("key")).toBe("a");
		expect(s2.get("key")).toBe("b");
	});

	it("authorize makes hidden tools visible", () => {
		const server = createTestServer();
		const mw: ToolMiddleware = {
			name: "auth",
			onRegister: () => false,
		};
		server.tool("protected", mw, { name: z.string() }, async () => ({
			content: [{ type: "text", text: "ok" }],
		}));

		expect(server._isToolVisible("protected", "s1")).toBe(false);

		const session = server._createSessionAPI("s1");
		session.authorize("auth");

		expect(server._isToolVisible("protected", "s1")).toBe(true);
	});

	it("revoke hides previously authorized tools", () => {
		const server = createTestServer();
		const mw: ToolMiddleware = {
			name: "auth",
			onRegister: () => false,
		};
		server.tool("protected", mw, { name: z.string() }, async () => ({
			content: [{ type: "text", text: "ok" }],
		}));

		const session = server._createSessionAPI("s1");
		session.authorize("auth");
		expect(server._isToolVisible("protected", "s1")).toBe(true);

		session.revoke("auth");
		expect(server._isToolVisible("protected", "s1")).toBe(false);
	});

	it("enableTools/disableTools control individual tool visibility", () => {
		const server = createTestServer();
		server.tool("tool-a", { name: z.string() }, async () => ({
			content: [{ type: "text", text: "ok" }],
		}));
		server.tool("tool-b", { name: z.string() }, async () => ({
			content: [{ type: "text", text: "ok" }],
		}));

		const session = server._createSessionAPI("s1");

		session.disableTools("tool-a");
		expect(server._isToolVisible("tool-a", "s1")).toBe(false);
		expect(server._isToolVisible("tool-b", "s1")).toBe(true);

		session.enableTools("tool-a");
		expect(server._isToolVisible("tool-a", "s1")).toBe(true);
	});
});

describe("tools/list integration", () => {
	it("returns only visible tools", async () => {
		const server = createTestServer();
		const mw: ToolMiddleware = {
			name: "auth",
			onRegister: () => false,
		};

		server.tool("public", { query: z.string() }, async () => ({
			content: [{ type: "text", text: "ok" }],
		}));
		server.tool("private", mw, { query: z.string() }, async () => ({
			content: [{ type: "text", text: "ok" }],
		}));

		const { Client } = await import(
			"@modelcontextprotocol/sdk/client/index.js"
		);
		const { InMemoryTransport } = await import(
			"@modelcontextprotocol/sdk/inMemory.js"
		);

		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		const client = new Client({ name: "test-client", version: "1.0.0" });

		await Promise.all([
			server._server.connect(serverTransport),
			client.connect(clientTransport),
		]);

		const result = await client.listTools();
		const names = result.tools.map((t: any) => t.name);

		expect(names).toContain("public");
		expect(names).not.toContain("private");

		await client.close();
	});
});
