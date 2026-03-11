import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../../src/core.js";
import { credentials } from "../../src/middleware/credentials.js";
import { text } from "../../src/response.js";

function createTestServer() {
	return createMCPServer({ name: "test", version: "1.0.0" }) as any;
}

describe("credentials middleware", () => {
	it("hides tools on registration", () => {
		const server = createTestServer();
		server.tool(
			"secret",
			credentials({
				message: "Login",
				schema: z.object({ user: z.string() }),
				verify: async () => ({ id: 1 }),
			}),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		expect(server._isToolVisible("secret", "s1")).toBe(false);
	});

	it("has correct default name", () => {
		const mw = credentials({
			message: "Login",
			schema: z.object({ user: z.string() }),
			verify: async () => null,
		});
		expect(mw.name).toBe("credentials");
	});

	it("uses custom name", () => {
		const mw = credentials({
			name: "login-form",
			message: "Login",
			schema: z.object({ user: z.string() }),
			verify: async () => null,
		});
		expect(mw.name).toBe("login-form");
	});

	it("skips elicit when already authenticated", async () => {
		const verify = vi.fn();
		const server = createTestServer();

		const mw = credentials({
			message: "Login",
			schema: z.object({ user: z.string() }),
			verify,
		});

		server.tool("secret", mw, { input: z.object({}) }, async () => text("ok"));

		// Manually set user in session and authorize
		const session = server._createSessionAPI("s1");
		session.set("user", { id: 1, name: "alice" });
		session.authorize("credentials");

		// verify should not be called since user is already set
		expect(verify).not.toHaveBeenCalled();
	});
});
