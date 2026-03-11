import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../src/core.js";
import { auth } from "../src/middleware/auth.js";
import { error, text } from "../src/response.js";

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
});
