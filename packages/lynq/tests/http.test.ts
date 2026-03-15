import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../src/core.js";
import { auth } from "../src/middleware/auth.js";
import { error, text } from "../src/response.js";
import type { ServerOptions } from "../src/types.js";

const PROTOCOL_VERSION = "2025-03-26";

function initBody(id = 1) {
	return {
		jsonrpc: "2.0",
		id,
		method: "initialize",
		params: {
			protocolVersion: PROTOCOL_VERSION,
			capabilities: {},
			clientInfo: { name: "test-client", version: "1.0.0" },
		},
	};
}

function toolsListBody(id = 2) {
	return { jsonrpc: "2.0", id, method: "tools/list", params: {} };
}

function callToolBody(name: string, args: Record<string, unknown>, id = 3) {
	return {
		jsonrpc: "2.0",
		id,
		method: "tools/call",
		params: { name, arguments: args },
	};
}

async function post(
	handler: (req: Request) => Promise<Response>,
	body: unknown,
	sessionId?: string,
): Promise<{ response: Response; json: unknown }> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		Accept: "application/json, text/event-stream",
	};
	if (sessionId) headers["mcp-session-id"] = sessionId;
	const response = await handler(
		new Request("http://localhost/mcp", {
			method: "POST",
			headers,
			body: JSON.stringify(body),
		}),
	);
	const json = await response.json();
	return { response, json };
}

describe("server.http()", () => {
	it("returns a function", () => {
		const server = createMCPServer({ name: "test", version: "1.0.0" });
		const handler = server.http({ enableJsonResponse: true });
		expect(handler).toBeTypeOf("function");
	});

	it("handles initialize and returns session ID (stateful)", async () => {
		const server = createMCPServer({ name: "test", version: "1.0.0" });
		const handler = server.http({ enableJsonResponse: true });

		const { response, json } = await post(handler, initBody());

		expect(response.status).toBe(200);
		expect(response.headers.get("mcp-session-id")).toBeTruthy();
		expect((json as any).result?.protocolVersion).toBeDefined();
	});

	it("lists tools via HTTP", async () => {
		const server = createMCPServer({ name: "test", version: "1.0.0" });
		server.tool(
			"greet",
			{
				description: "Greet",
				input: z.object({ name: z.string() }),
			},
			async (args) => text(`Hello ${args.name}`),
		);

		const handler = server.http({ enableJsonResponse: true });

		// Initialize first
		const { response: initRes } = await post(handler, initBody());
		const sessionId = initRes.headers.get("mcp-session-id")!;
		expect(sessionId).toBeTruthy();

		// List tools
		const { json } = await post(handler, toolsListBody(), sessionId);
		const tools = (json as any).result?.tools;
		expect(tools).toHaveLength(1);
		expect(tools[0].name).toBe("greet");
	});

	it("calls a tool via HTTP", async () => {
		const server = createMCPServer({ name: "test", version: "1.0.0" });
		server.tool(
			"greet",
			{
				description: "Greet",
				input: z.object({ name: z.string() }),
			},
			async (args) => text(`Hello ${args.name}`),
		);

		const handler = server.http({ enableJsonResponse: true });

		const { response: initRes } = await post(handler, initBody());
		const sessionId = initRes.headers.get("mcp-session-id")!;

		const { json } = await post(
			handler,
			callToolBody("greet", { name: "World" }),
			sessionId,
		);
		expect((json as any).result?.content[0]?.text).toBe("Hello World");
	});

	it("returns 404 for unknown session ID", async () => {
		const server = createMCPServer({ name: "test", version: "1.0.0" });
		const handler = server.http({ enableJsonResponse: true });

		const { response } = await post(
			handler,
			toolsListBody(),
			"nonexistent-session-id",
		);
		expect(response.status).toBe(404);
	});

	it("isolates session state between HTTP sessions", async () => {
		const server = createMCPServer({ name: "test", version: "1.0.0" });

		server.tool(
			"login",
			{ description: "Login", input: z.object({ user: z.string() }) },
			async (args, c) => {
				c.session.authorize("auth");
				return text(`Welcome ${args.user}`);
			},
		);

		server.tool("secret", auth(), { description: "Secret tool" }, async () =>
			text("secret data"),
		);

		const handler = server.http({ enableJsonResponse: true });

		// Session A: initialize and login
		const { response: initA } = await post(handler, initBody(1));
		const sidA = initA.headers.get("mcp-session-id")!;
		await post(handler, callToolBody("login", { user: "alice" }, 2), sidA);

		// Session B: initialize only (no login)
		const { response: initB } = await post(handler, initBody(10));
		const sidB = initB.headers.get("mcp-session-id")!;

		// Session A should see 'secret' tool
		const { json: toolsA } = await post(handler, toolsListBody(3), sidA);
		const toolNamesA = ((toolsA as any).result?.tools ?? []).map(
			(t: any) => t.name,
		);
		expect(toolNamesA).toContain("secret");

		// Session B should NOT see 'secret' tool
		const { json: toolsB } = await post(handler, toolsListBody(11), sidB);
		const toolNamesB = ((toolsB as any).result?.tools ?? []).map(
			(t: any) => t.name,
		);
		expect(toolNamesB).not.toContain("secret");
	});

	it("works in sessionless mode", async () => {
		const server = createMCPServer({ name: "test", version: "1.0.0" });
		server.tool("ping", { description: "Ping" }, async () => text("pong"));

		const handler = server.http({
			sessionless: true,
			enableJsonResponse: true,
		});

		// Initialize (no session ID expected)
		const { response: initRes, json: initJson } = await post(
			handler,
			initBody(),
		);
		expect(initRes.status).toBe(200);
		expect((initJson as any).result?.protocolVersion).toBeDefined();

		// List tools (no session ID)
		const { json } = await post(handler, toolsListBody());
		const tools = (json as any).result?.tools;
		expect(tools).toHaveLength(1);
		expect(tools[0].name).toBe("ping");
	});

	it("uses custom sessionIdGenerator", async () => {
		const server = createMCPServer({ name: "test", version: "1.0.0" });
		const handler = server.http({
			enableJsonResponse: true,
			sessionIdGenerator: () => "custom-session-123",
		});

		const { response } = await post(handler, initBody());
		expect(response.headers.get("mcp-session-id")).toBe("custom-session-123");
	});

	it("concurrent tool calls on same session do not corrupt state", async () => {
		let callCount = 0;
		const server = createMCPServer({ name: "test", version: "1.0.0" });
		server.tool(
			"counter",
			{ input: z.object({ n: z.number() }) },
			async (args) => {
				callCount++;
				return text(`${args.n}`);
			},
		);

		const handler = server.http({ enableJsonResponse: true });
		const { response: initRes } = await post(handler, initBody());
		const sessionId = initRes.headers.get("mcp-session-id")!;

		const [r1, r2, r3] = await Promise.all([
			post(handler, callToolBody("counter", { n: 1 }, 10), sessionId),
			post(handler, callToolBody("counter", { n: 2 }, 11), sessionId),
			post(handler, callToolBody("counter", { n: 3 }, 12), sessionId),
		]);

		expect(callCount).toBe(3);
		expect(r1.response.status).toBe(200);
		expect(r2.response.status).toBe(200);
		expect(r3.response.status).toBe(200);
	});

	it("multiple initializations create separate sessions", async () => {
		const server = createMCPServer({ name: "test", version: "1.0.0" });
		const handler = server.http({ enableJsonResponse: true });

		const { response: r1 } = await post(handler, initBody(1));
		const { response: r2 } = await post(handler, initBody(2));

		const sid1 = r1.headers.get("mcp-session-id");
		const sid2 = r2.headers.get("mcp-session-id");

		expect(sid1).toBeTruthy();
		expect(sid2).toBeTruthy();
		expect(sid1).not.toBe(sid2);
	});

	it("DELETE request terminates session", async () => {
		const server = createMCPServer({ name: "test", version: "1.0.0" });
		const handler = server.http({ enableJsonResponse: true });

		const { response: initRes } = await post(handler, initBody());
		const sessionId = initRes.headers.get("mcp-session-id")!;

		// Verify session is active
		const { response: listRes } = await post(
			handler,
			toolsListBody(2),
			sessionId,
		);
		expect(listRes.status).toBe(200);

		// Send DELETE to terminate
		const deleteRes = await handler(
			new Request("http://localhost/mcp", {
				method: "DELETE",
				headers: { "mcp-session-id": sessionId },
			}),
		);
		expect(deleteRes.status).toBeLessThan(500);

		// Session should now be gone
		const { response: afterDelete } = await post(
			handler,
			toolsListBody(3),
			sessionId,
		);
		expect(afterDelete.status).toBe(404);
	});

	it("onRequest hook can inject session data", async () => {
		const server = createMCPServer({ name: "test", version: "1.0.0" });
		server.tool("check", {}, async (_args, c) => {
			const injected = c.session.get("injected");
			return text(injected ? "yes" : "no");
		});

		const handler = server.http({
			enableJsonResponse: true,
			onRequest: (_req, _sid, session) => {
				session.set("injected", true);
			},
		});

		const { response: initRes } = await post(handler, initBody());
		const sessionId = initRes.headers.get("mcp-session-id")!;

		const { json } = await post(
			handler,
			callToolBody("check", {}, 2),
			sessionId,
		);
		expect((json as any).result?.content[0]?.text).toBe("yes");
	});

	it("onSessionDestroy fires when session is closed", async () => {
		const destroySpy = vi.fn();
		const server = createMCPServer({
			name: "test",
			version: "1.0.0",
			onSessionDestroy: destroySpy,
		} as ServerOptions);

		const handler = server.http({ enableJsonResponse: true });

		const { response: initRes } = await post(handler, initBody());
		const sessionId = initRes.headers.get("mcp-session-id")!;

		// DELETE to close session
		await handler(
			new Request("http://localhost/mcp", {
				method: "DELETE",
				headers: { "mcp-session-id": sessionId },
			}),
		);

		// Give async callbacks time to fire
		await new Promise((r) => setTimeout(r, 50));
		expect(destroySpy).toHaveBeenCalledWith(sessionId, expect.anything());
	});
});
