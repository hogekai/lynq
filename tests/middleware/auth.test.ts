import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../../src/core.js";
import { auth } from "../../src/middleware/auth.js";

function createTestServer() {
	return createMCPServer({ name: "test", version: "1.0.0" }) as any;
}

async function createConnectedPair(server: any) {
	const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
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

	return client;
}

describe("auth middleware", () => {
	it("hides tools on registration (onRegister returns false)", () => {
		const server = createTestServer();
		server.tool("secret", auth(), { query: z.string() }, async () => ({
			content: [{ type: "text", text: "ok" }],
		}));

		expect(server._isToolVisible("secret", "s1")).toBe(false);
	});

	it("shows tools after session.authorize('auth')", () => {
		const server = createTestServer();
		server.tool("secret", auth(), { query: z.string() }, async () => ({
			content: [{ type: "text", text: "ok" }],
		}));

		const session = server._createSessionAPI("s1");
		session.authorize("auth");

		expect(server._isToolVisible("secret", "s1")).toBe(true);
	});

	it("blocks call when session has no user", async () => {
		const server = createTestServer();
		server.tool("secret", auth(), { query: z.string() }, async (args: any) => ({
			content: [{ type: "text", text: `Result: ${args.query}` }],
		}));

		// Authorize the middleware so the tool is visible, but don't set user
		const session = server._createSessionAPI("default");
		session.authorize("auth");

		const client = await createConnectedPair(server);

		const result = await client.callTool({
			name: "secret",
			arguments: { query: "test" },
		});

		expect(result.isError).toBe(true);
		expect((result.content as any)[0].text).toContain(
			"Authentication required",
		);

		await client.close();
	});

	it("allows call when session has user set", async () => {
		const server = createTestServer();
		// Register a login tool that sets session user
		server.tool(
			"login",
			{ username: z.string() },
			async (args: any, ctx: any) => {
				ctx.session.set("user", { name: args.username });
				ctx.session.authorize("auth");
				return { content: [{ type: "text", text: "Logged in" }] };
			},
		);
		server.tool("secret", auth(), { query: z.string() }, async (args: any) => ({
			content: [{ type: "text", text: `Secret: ${args.query}` }],
		}));

		const client = await createConnectedPair(server);

		// Login first
		await client.callTool({
			name: "login",
			arguments: { username: "alice" },
		});

		// Now call the secret tool
		const result = await client.callTool({
			name: "secret",
			arguments: { query: "data" },
		});

		expect(result.isError).toBeUndefined();
		expect((result.content as any)[0].text).toBe("Secret: data");

		await client.close();
	});

	it("uses custom sessionKey", () => {
		const server = createTestServer();
		const customAuth = auth({ sessionKey: "token" });
		expect(customAuth.name).toBe("auth");

		server.tool("api", customAuth, { query: z.string() }, async () => ({
			content: [{ type: "text", text: "ok" }],
		}));

		expect(server._isToolVisible("api", "s1")).toBe(false);
	});

	it("auth as global middleware hides all subsequently registered tools", () => {
		const server = createTestServer();
		server.use(auth());

		server.tool("tool-a", { query: z.string() }, async () => ({
			content: [{ type: "text", text: "ok" }],
		}));
		server.tool("tool-b", { query: z.string() }, async () => ({
			content: [{ type: "text", text: "ok" }],
		}));

		expect(server._isToolVisible("tool-a", "s1")).toBe(false);
		expect(server._isToolVisible("tool-b", "s1")).toBe(false);

		// Authorize makes both visible
		const session = server._createSessionAPI("s1");
		session.authorize("auth");

		expect(server._isToolVisible("tool-a", "s1")).toBe(true);
		expect(server._isToolVisible("tool-b", "s1")).toBe(true);
	});
});
