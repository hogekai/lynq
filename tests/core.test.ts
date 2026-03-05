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

	it("registers a tool with config and handler", () => {
		const server = createTestServer();
		server.tool(
			"greet",
			{ input: z.object({ name: z.string() }) },
			async (args: any) => ({
				content: [{ type: "text", text: `Hello ${args.name}` }],
			}),
		);
		expect(server._isToolVisible("greet", "default")).toBe(true);
	});

	it("registers a tool with description in config", () => {
		const server = createTestServer();
		server.tool(
			"greet",
			{
				description: "Greet someone",
				input: z.object({ name: z.string() }),
			},
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
		server.tool(
			"hidden",
			{ input: z.object({ name: z.string() }) },
			async () => ({
				content: [{ type: "text", text: "ok" }],
			}),
		);
		expect(server._isToolVisible("hidden", "default")).toBe(false);
	});

	it("applies per-tool middleware", () => {
		const server = createTestServer();
		const mw: ToolMiddleware = {
			name: "guard",
			onRegister: () => false,
		};
		server.tool(
			"guarded",
			mw,
			{ input: z.object({ name: z.string() }) },
			async () => ({
				content: [{ type: "text", text: "ok" }],
			}),
		);
		server.tool(
			"open",
			{ input: z.object({ name: z.string() }) },
			async () => ({
				content: [{ type: "text", text: "ok" }],
			}),
		);
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
		server.tool(
			"test",
			perToolMw,
			{ input: z.object({ name: z.string() }) },
			async () => {
				order.push("handler");
				return { content: [{ type: "text", text: "ok" }] };
			},
		);

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

	it("calls onRegister once at registration, not on every tools/list", async () => {
		const server = createTestServer();
		const onRegisterSpy = vi.fn(() => false);
		const mw: ToolMiddleware = {
			name: "spy-mw",
			onRegister: onRegisterSpy,
		};

		server.tool(
			"spied",
			mw,
			{ input: z.object({ name: z.string() }) },
			async () => ({
				content: [{ type: "text", text: "ok" }],
			}),
		);

		// onRegister called once at registration
		expect(onRegisterSpy).toHaveBeenCalledTimes(1);

		// Connect and list tools multiple times
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

		// Authorize so tool is visible, then list multiple times
		const session = server._createSessionAPI("default");
		session.authorize("spy-mw");

		await client.listTools();
		await client.listTools();
		await client.listTools();

		// Still only called once (at registration)
		expect(onRegisterSpy).toHaveBeenCalledTimes(1);

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
		server.tool(
			"protected",
			mw,
			{ input: z.object({ name: z.string() }) },
			async () => ({
				content: [{ type: "text", text: "ok" }],
			}),
		);

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
		server.tool(
			"protected",
			mw,
			{ input: z.object({ name: z.string() }) },
			async () => ({
				content: [{ type: "text", text: "ok" }],
			}),
		);

		const session = server._createSessionAPI("s1");
		session.authorize("auth");
		expect(server._isToolVisible("protected", "s1")).toBe(true);

		session.revoke("auth");
		expect(server._isToolVisible("protected", "s1")).toBe(false);
	});

	it("enableTools/disableTools control individual tool visibility", () => {
		const server = createTestServer();
		server.tool(
			"tool-a",
			{ input: z.object({ name: z.string() }) },
			async () => ({
				content: [{ type: "text", text: "ok" }],
			}),
		);
		server.tool(
			"tool-b",
			{ input: z.object({ name: z.string() }) },
			async () => ({
				content: [{ type: "text", text: "ok" }],
			}),
		);

		const session = server._createSessionAPI("s1");

		session.disableTools("tool-a");
		expect(server._isToolVisible("tool-a", "s1")).toBe(false);
		expect(server._isToolVisible("tool-b", "s1")).toBe(true);

		session.enableTools("tool-a");
		expect(server._isToolVisible("tool-a", "s1")).toBe(true);
	});
});

describe("tool() argument validation", () => {
	it("throws when last argument is not a function", () => {
		const server = createTestServer();
		expect(() => {
			server.tool(
				"bad",
				{ input: z.object({ name: z.string() }) },
				"not-a-function",
			);
		}).toThrow('tool("bad"): last argument must be a handler function');
	});

	it("throws when config is not a plain object", () => {
		const server = createTestServer();
		expect(() => {
			server.tool("bad", "not-a-config", async () => ({
				content: [{ type: "text", text: "ok" }],
			}));
		}).toThrow('tool("bad"): second-to-last argument must be a config object');
	});

	it("throws when middleware lacks a name property", () => {
		const server = createTestServer();
		expect(() => {
			server.tool(
				"bad",
				{ noName: true } as any,
				{ input: z.object({ name: z.string() }) },
				async () => ({
					content: [{ type: "text", text: "ok" }],
				}),
			);
		}).toThrow('tool("bad"): each middleware must have a "name" property');
	});
});

describe("tools/list integration", () => {
	it("returns only visible tools", async () => {
		const server = createTestServer();
		const mw: ToolMiddleware = {
			name: "auth",
			onRegister: () => false,
		};

		server.tool(
			"public",
			{ input: z.object({ query: z.string() }) },
			async () => ({
				content: [{ type: "text", text: "ok" }],
			}),
		);
		server.tool(
			"private",
			mw,
			{ input: z.object({ query: z.string() }) },
			async () => ({
				content: [{ type: "text", text: "ok" }],
			}),
		);

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
