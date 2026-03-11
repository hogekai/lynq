import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../../src/core.js";
import { guard } from "../../src/middleware/guard.js";
import { text } from "../../src/response.js";
import { createTestClient } from "../../src/test.js";

function createTestServer() {
	return createMCPServer({ name: "test", version: "1.0.0" }) as any;
}

describe("guard middleware", () => {
	it("hides tools on registration (onRegister returns false)", () => {
		const server = createTestServer();
		server.tool(
			"secret",
			guard(),
			{ input: z.object({ query: z.string() }) },
			async () => text("ok"),
		);

		expect(server._isToolVisible("secret", "s1")).toBe(false);
	});

	it("shows tools after session.authorize('guard')", () => {
		const server = createTestServer();
		server.tool(
			"secret",
			guard(),
			{ input: z.object({ query: z.string() }) },
			async () => text("ok"),
		);

		const session = server._createSessionAPI("s1");
		session.authorize("guard");

		expect(server._isToolVisible("secret", "s1")).toBe(true);
	});

	it("blocks call when session has no user", async () => {
		const server = createTestServer();
		server.tool(
			"secret",
			guard(),
			{ input: z.object({ query: z.string() }) },
			async (args: any) => text(`Result: ${args.query}`),
		);

		const t = await createTestClient(server);
		t.authorize("guard");

		const result = await t.callTool("secret", { query: "test" });

		expect(result.isError).toBe(true);
		expect((result.content as any)[0].text).toContain("Authorization required");

		await t.close();
	});

	it("allows call when session has user set", async () => {
		const server = createTestServer();
		server.tool(
			"login",
			{ input: z.object({ username: z.string() }) },
			async (args: any, c: any) => {
				c.session.set("user", { name: args.username });
				c.session.authorize("guard");
				return text("Logged in");
			},
		);
		server.tool(
			"secret",
			guard(),
			{ input: z.object({ query: z.string() }) },
			async (args: any) => text(`Secret: ${args.query}`),
		);

		const t = await createTestClient(server);

		await t.callTool("login", { username: "alice" });
		const result = await t.callTool("secret", { query: "data" });

		expect(result.isError).toBeUndefined();
		expect((result.content as any)[0].text).toBe("Secret: data");

		await t.close();
	});

	it("uses custom sessionKey", () => {
		const server = createTestServer();
		const g = guard({ sessionKey: "token" });
		expect(g.name).toBe("guard");

		server.tool(
			"api",
			g,
			{ input: z.object({ query: z.string() }) },
			async () => text("ok"),
		);

		expect(server._isToolVisible("api", "s1")).toBe(false);
	});

	it("uses custom name for authorize/revoke", () => {
		const server = createTestServer();
		server.tool(
			"admin_panel",
			guard({ name: "admin", sessionKey: "admin" }),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		expect(server._isToolVisible("admin_panel", "s1")).toBe(false);

		const session = server._createSessionAPI("s1");
		session.authorize("admin");

		expect(server._isToolVisible("admin_panel", "s1")).toBe(true);
	});

	it("supports multiple independent guard scopes", () => {
		const server = createTestServer();
		server.tool("weather", guard(), { input: z.object({}) }, async () =>
			text("ok"),
		);
		server.tool(
			"admin_panel",
			guard({ name: "admin", sessionKey: "admin" }),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		const session = server._createSessionAPI("s1");

		// Neither visible initially
		expect(server._isToolVisible("weather", "s1")).toBe(false);
		expect(server._isToolVisible("admin_panel", "s1")).toBe(false);

		// Authorize guard scope only
		session.authorize("guard");
		expect(server._isToolVisible("weather", "s1")).toBe(true);
		expect(server._isToolVisible("admin_panel", "s1")).toBe(false);

		// Authorize admin scope
		session.authorize("admin");
		expect(server._isToolVisible("admin_panel", "s1")).toBe(true);
	});

	it("guard as global middleware hides all subsequently registered tools", () => {
		const server = createTestServer();
		server.use(guard());

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

		const session = server._createSessionAPI("s1");
		session.authorize("guard");

		expect(server._isToolVisible("tool-a", "s1")).toBe(true);
		expect(server._isToolVisible("tool-b", "s1")).toBe(true);
	});
});
