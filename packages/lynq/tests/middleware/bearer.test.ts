import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../../src/core.js";
import { getInternals } from "../../src/internals.js";
import { bearer } from "../../src/middleware/bearer.js";
import { text } from "../../src/response.js";
import { createTestClient } from "../../src/test.js";

function createTestServer() {
	return createMCPServer({ name: "test", version: "1.0.0" }) as any;
}

describe("bearer middleware", () => {
	it("hides tools on registration", () => {
		const server = createTestServer();
		server.tool(
			"secret",
			bearer({ verify: async () => ({ id: 1 }) }),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		expect(getInternals(server).isToolVisible("secret", "s1")).toBe(false);
	});

	it("has correct default name", () => {
		const mw = bearer({ verify: async () => null });
		expect(mw.name).toBe("bearer");
	});

	it("uses custom name", () => {
		const mw = bearer({ name: "api-key", verify: async () => null });
		expect(mw.name).toBe("api-key");
	});

	it("skips verification when already authenticated", async () => {
		const verify = vi.fn();
		const server = createTestServer();

		server.tool(
			"secret",
			bearer({ verify }),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		const session = getInternals(server).createSessionAPI("s1");
		session.set("user", { id: 1 });
		session.authorize("bearer");

		expect(verify).not.toHaveBeenCalled();
	});

	it("returns error when token is missing", async () => {
		const server = createTestServer();
		server.tool(
			"secret",
			bearer({ verify: async () => ({ id: 1 }) }),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		const t = await createTestClient(server);
		t.authorize("bearer");

		const result = await t.callTool("secret", {});
		expect(result.isError).toBe(true);
		expect((result.content as any)[0].text).toContain(
			"Invalid or missing token",
		);

		await t.close();
	});

	it("returns error when verify returns null", async () => {
		const server = createTestServer();
		server.tool(
			"secret",
			bearer({ verify: async () => null }),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		const t = await createTestClient(server);
		t.authorize("bearer");
		t.session.set("token", "bad-token");

		const result = await t.callTool("secret", {});
		expect(result.isError).toBe(true);
		expect((result.content as any)[0].text).toContain(
			"Invalid or missing token",
		);

		await t.close();
	});

	it("stores user and authorizes on successful verification", async () => {
		const server = createTestServer();
		server.tool(
			"secret",
			bearer({
				verify: async (token) => {
					if (token === "valid-token") return { id: 1, name: "alice" };
					return null;
				},
			}),
			{ input: z.object({}) },
			async (_args: any, c: any) => text(`Hello ${c.session.get("user").name}`),
		);

		const t = await createTestClient(server);
		t.authorize("bearer");
		t.session.set("token", "valid-token");

		const result = await t.callTool("secret", {});
		expect(result.isError).toBeUndefined();
		expect((result.content as any)[0].text).toBe("Hello alice");

		await t.close();
	});

	it("uses custom tokenKey and sessionKey", async () => {
		const server = createTestServer();
		server.tool(
			"secret",
			bearer({
				tokenKey: "api_key",
				sessionKey: "account",
				verify: async (token) => {
					if (token === "key123") return { id: 42 };
					return null;
				},
			}),
			{ input: z.object({}) },
			async (_args: any, c: any) => text(`ID: ${c.session.get("account").id}`),
		);

		const t = await createTestClient(server);
		t.authorize("bearer");
		t.session.set("api_key", "key123");

		const result = await t.callTool("secret", {});
		expect(result.isError).toBeUndefined();
		expect((result.content as any)[0].text).toBe("ID: 42");

		await t.close();
	});

	it("uses custom error message", async () => {
		const server = createTestServer();
		server.tool(
			"secret",
			bearer({
				verify: async () => null,
				message: "API key required",
			}),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		const t = await createTestClient(server);
		t.authorize("bearer");

		const result = await t.callTool("secret", {});
		expect((result.content as any)[0].text).toContain("API key required");

		await t.close();
	});
});
