import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../src/core.js";
import { createTestClient } from "../src/test.js";
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

		const t = await createTestClient(server);

		const result = await t.callTool("test", { name: "world" });

		expect(order).toEqual(["global", "per-tool", "handler"]);
		expect(result.content).toEqual([{ type: "text", text: "ok" }]);

		await t.close();
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

		const t = await createTestClient(server);

		// Authorize so tool is visible, then list multiple times
		t.authorize("spy-mw");

		await t.listTools();
		await t.listTools();
		await t.listTools();

		// Still only called once (at registration)
		expect(onRegisterSpy).toHaveBeenCalledTimes(1);

		await t.close();
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

describe("onResult", () => {
	it("runs onResult in reverse middleware order after handler", async () => {
		const server = createTestServer();
		const order: string[] = [];

		const mw1: ToolMiddleware = {
			name: "mw1",
			async onCall(ctx, next) {
				order.push("mw1:call");
				return next();
			},
			onResult(result, ctx) {
				order.push("mw1:result");
				return result;
			},
		};

		const mw2: ToolMiddleware = {
			name: "mw2",
			async onCall(ctx, next) {
				order.push("mw2:call");
				return next();
			},
			onResult(result, ctx) {
				order.push("mw2:result");
				return result;
			},
		};

		server.tool("test", mw1, mw2, {}, async () => {
			order.push("handler");
			return { content: [{ type: "text", text: "ok" }] };
		});

		const t = await createTestClient(server);
		await t.callTool("test");

		// onResult runs in reverse: mw2 first, then mw1
		expect(order).toEqual([
			"mw1:call",
			"mw2:call",
			"handler",
			"mw2:result",
			"mw1:result",
		]);

		await t.close();
	});

	it("onResult can modify the result", async () => {
		const server = createTestServer();

		const truncateMw: ToolMiddleware = {
			name: "truncate",
			onResult(result) {
				return {
					...result,
					content: [{ type: "text" as const, text: "modified" }],
				};
			},
		};

		server.tool("test", truncateMw, {}, async () => ({
			content: [{ type: "text", text: "original" }],
		}));

		const t = await createTestClient(server);
		const result = await t.callTool("test");

		expect(result.content).toEqual([{ type: "text", text: "modified" }]);

		await t.close();
	});

	it("onResult does not run when onCall short-circuits", async () => {
		const server = createTestServer();
		const resultCalled = vi.fn();

		const blockMw: ToolMiddleware = {
			name: "blocker",
			async onCall() {
				// Does not call next()
				return { content: [{ type: "text", text: "blocked" }] };
			},
			onResult(result) {
				resultCalled();
				return result;
			},
		};

		server.tool("test", blockMw, {}, async () => ({
			content: [{ type: "text", text: "ok" }],
		}));

		const t = await createTestClient(server);
		const result = await t.callTool("test");

		expect(result.content).toEqual([{ type: "text", text: "blocked" }]);
		expect(resultCalled).not.toHaveBeenCalled();

		await t.close();
	});

	it("works with global + per-tool middleware together", async () => {
		const server = createTestServer();
		const trail: string[] = [];

		const globalMw: ToolMiddleware = {
			name: "global",
			onResult(result) {
				trail.push("global");
				return result;
			},
		};

		const localMw: ToolMiddleware = {
			name: "local",
			onResult(result) {
				trail.push("local");
				return result;
			},
		};

		server.use(globalMw);
		server.tool("test", localMw, {}, async () => ({
			content: [{ type: "text", text: "ok" }],
		}));

		const t = await createTestClient(server);
		await t.callTool("test");

		// Reverse order: local first (last registered), then global
		expect(trail).toEqual(["local", "global"]);

		await t.close();
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

		const t = await createTestClient(server);
		const names = await t.listTools();

		expect(names).toContain("public");
		expect(names).not.toContain("private");

		await t.close();
	});
});
