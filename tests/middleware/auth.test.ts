import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../../src/core.js";
import { auth } from "../../src/middleware/auth.js";
import { error, text } from "../../src/response.js";
import { createTestClient } from "../../src/test.js";

function createTestServer() {
	return createMCPServer({ name: "test", version: "1.0.0" }) as any;
}

describe("auth middleware", () => {
	it("hides tools on registration (onRegister returns false)", () => {
		const server = createTestServer();
		server.tool(
			"secret",
			auth(),
			{ input: z.object({ query: z.string() }) },
			async () => text("ok"),
		);

		expect(server._isToolVisible("secret", "s1")).toBe(false);
	});

	it("shows tools after session.authorize('auth')", () => {
		const server = createTestServer();
		server.tool(
			"secret",
			auth(),
			{ input: z.object({ query: z.string() }) },
			async () => text("ok"),
		);

		const session = server._createSessionAPI("s1");
		session.authorize("auth");

		expect(server._isToolVisible("secret", "s1")).toBe(true);
	});

	it("blocks call when session has no user", async () => {
		const server = createTestServer();
		server.tool(
			"secret",
			auth(),
			{ input: z.object({ query: z.string() }) },
			async (args: any) => text(`Result: ${args.query}`),
		);

		// Authorize the middleware so the tool is visible, but don't set user
		const t = await createTestClient(server);
		t.authorize("auth");

		const result = await t.callTool("secret", { query: "test" });

		expect(result.isError).toBe(true);
		expect((result.content as any)[0].text).toContain(
			"Authentication required",
		);

		await t.close();
	});

	it("allows call when session has user set", async () => {
		const server = createTestServer();
		server.tool(
			"login",
			{ input: z.object({ username: z.string() }) },
			async (args: any, ctx: any) => {
				ctx.session.set("user", { name: args.username });
				ctx.session.authorize("auth");
				return text("Logged in");
			},
		);
		server.tool(
			"secret",
			auth(),
			{ input: z.object({ query: z.string() }) },
			async (args: any) => text(`Secret: ${args.query}`),
		);

		const t = await createTestClient(server);

		// Login first
		await t.callTool("login", { username: "alice" });

		// Now call the secret tool
		const result = await t.callTool("secret", { query: "data" });

		expect(result.isError).toBeUndefined();
		expect((result.content as any)[0].text).toBe("Secret: data");

		await t.close();
	});

	it("uses custom sessionKey", () => {
		const server = createTestServer();
		const customAuth = auth({ sessionKey: "token" });
		expect(customAuth.name).toBe("auth");

		server.tool(
			"api",
			customAuth,
			{ input: z.object({ query: z.string() }) },
			async () => text("ok"),
		);

		expect(server._isToolVisible("api", "s1")).toBe(false);
	});

	it("auth as global middleware hides all subsequently registered tools", () => {
		const server = createTestServer();
		server.use(auth());

		server.tool(
			"tool-a",
			{ input: z.object({ query: z.string() }) },
			async () => text("ok"),
		);
		server.tool(
			"tool-b",
			{ input: z.object({ query: z.string() }) },
			async () => text("ok"),
		);

		expect(server._isToolVisible("tool-a", "s1")).toBe(false);
		expect(server._isToolVisible("tool-b", "s1")).toBe(false);

		// Authorize makes both visible
		const session = server._createSessionAPI("s1");
		session.authorize("auth");

		expect(server._isToolVisible("tool-a", "s1")).toBe(true);
		expect(server._isToolVisible("tool-b", "s1")).toBe(true);
	});
});
