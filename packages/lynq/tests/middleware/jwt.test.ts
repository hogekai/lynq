import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../../src/core.js";
import { jwt } from "../../src/middleware/jwt.js";
import { text } from "../../src/response.js";
import { createTestClient } from "../../src/test.js";

const TEST_SECRET = "super-secret-key-for-testing-only";

async function createToken(
	payload: Record<string, unknown>,
	secret = TEST_SECRET,
	options?: { expiresIn?: string },
) {
	const key = new TextEncoder().encode(secret);
	let builder = new SignJWT(payload)
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt();
	if (options?.expiresIn) {
		builder = builder.setExpirationTime(options.expiresIn);
	}
	return builder.sign(key);
}

function createTestServer() {
	return createMCPServer({ name: "test", version: "1.0.0" }) as any;
}

describe("jwt middleware", () => {
	it("hides tools on registration", () => {
		const server = createTestServer();
		server.tool(
			"secret",
			jwt({ secret: TEST_SECRET }),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		expect(server._isToolVisible("secret", "s1")).toBe(false);
	});

	it("has correct default name", () => {
		const mw = jwt({ secret: TEST_SECRET });
		expect(mw.name).toBe("jwt");
	});

	it("uses custom name", () => {
		const mw = jwt({ name: "auth-jwt", secret: TEST_SECRET });
		expect(mw.name).toBe("auth-jwt");
	});

	it("skips verification when already authenticated", async () => {
		const server = createTestServer();
		server.tool(
			"secret",
			jwt({ secret: TEST_SECRET }),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		const t = await createTestClient(server);
		t.session.set("user", { sub: "123" });
		t.authorize("jwt");

		const result = await t.callTool("secret", {});
		expect(result.isError).toBeUndefined();

		await t.close();
	});

	it("returns error when token is missing", async () => {
		const server = createTestServer();
		server.tool(
			"secret",
			jwt({ secret: TEST_SECRET }),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		const t = await createTestClient(server);
		t.authorize("jwt");

		const result = await t.callTool("secret", {});
		expect(result.isError).toBe(true);
		expect((result.content as any)[0].text).toContain("JWT required");

		await t.close();
	});

	it("decodes valid JWT and stores payload", async () => {
		const token = await createToken({ sub: "user-1", role: "admin" });

		const server = createTestServer();
		server.tool(
			"secret",
			jwt({ secret: TEST_SECRET }),
			{ input: z.object({}) },
			async (_args: any, c: any) => {
				const user = c.session.get("user");
				return text(`${user.sub}:${user.role}`);
			},
		);

		const t = await createTestClient(server);
		t.authorize("jwt");
		t.session.set("token", token);

		const result = await t.callTool("secret", {});
		expect(result.isError).toBeUndefined();
		expect((result.content as any)[0].text).toBe("user-1:admin");

		await t.close();
	});

	it("rejects expired JWT", async () => {
		const token = await createToken({ sub: "user-1" }, TEST_SECRET, {
			expiresIn: "0s",
		});

		// Small delay to ensure token is expired
		await new Promise((r) => setTimeout(r, 1100));

		const server = createTestServer();
		server.tool(
			"secret",
			jwt({ secret: TEST_SECRET }),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		const t = await createTestClient(server);
		t.authorize("jwt");
		t.session.set("token", token);

		const result = await t.callTool("secret", {});
		expect(result.isError).toBe(true);
		expect((result.content as any)[0].text).toContain("Invalid or expired JWT");

		await t.close();
	});

	it("rejects JWT with wrong secret", async () => {
		const token = await createToken({ sub: "user-1" }, "wrong-secret");

		const server = createTestServer();
		server.tool(
			"secret",
			jwt({ secret: TEST_SECRET }),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		const t = await createTestClient(server);
		t.authorize("jwt");
		t.session.set("token", token);

		const result = await t.callTool("secret", {});
		expect(result.isError).toBe(true);

		await t.close();
	});

	it("supports custom validate function", async () => {
		const token = await createToken({ sub: "user-1", role: "admin" });

		const server = createTestServer();
		server.tool(
			"secret",
			jwt({
				secret: TEST_SECRET,
				validate: async (payload) => {
					if (payload.role !== "admin") return null;
					return { id: payload.sub, isAdmin: true };
				},
			}),
			{ input: z.object({}) },
			async (_args: any, c: any) => {
				const user = c.session.get("user");
				return text(`admin:${user.isAdmin}`);
			},
		);

		const t = await createTestClient(server);
		t.authorize("jwt");
		t.session.set("token", token);

		const result = await t.callTool("secret", {});
		expect(result.isError).toBeUndefined();
		expect((result.content as any)[0].text).toBe("admin:true");

		await t.close();
	});

	it("rejects when validate returns null", async () => {
		const token = await createToken({ sub: "user-1", role: "viewer" });

		const server = createTestServer();
		server.tool(
			"secret",
			jwt({
				secret: TEST_SECRET,
				validate: async (payload) => {
					if (payload.role !== "admin") return null;
					return payload;
				},
			}),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		const t = await createTestClient(server);
		t.authorize("jwt");
		t.session.set("token", token);

		const result = await t.callTool("secret", {});
		expect(result.isError).toBe(true);

		await t.close();
	});

	it("returns error when neither secret nor jwksUri is provided", async () => {
		const server = createTestServer();
		server.tool("secret", jwt({}), { input: z.object({}) }, async () =>
			text("ok"),
		);

		const t = await createTestClient(server);
		t.authorize("jwt");
		t.session.set("token", "some.jwt.token");

		const result = await t.callTool("secret", {});
		expect(result.isError).toBe(true);
		expect((result.content as any)[0].text).toContain("misconfigured");

		await t.close();
	});
});
