import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../../src/core.js";
import { every, except, some } from "../../src/middleware/combine.js";
import { guard } from "../../src/middleware/guard.js";
import { rateLimit } from "../../src/middleware/rate-limit.js";
import { error, text } from "../../src/response.js";
import { createTestClient } from "../../src/test.js";
import type { ToolMiddleware } from "../../src/types.js";

function createTestServer() {
	return createMCPServer({ name: "test", version: "1.0.0" }) as any;
}

function pass(name: string): ToolMiddleware {
	return {
		name,
		async onCall(_c, next) {
			return next();
		},
	};
}

function block(name: string, msg = "blocked"): ToolMiddleware {
	return {
		name,
		async onCall() {
			return error(msg);
		},
	};
}

describe("some()", () => {
	it("generates correct name", () => {
		const mw = some(pass("a"), pass("b"));
		expect(mw.name).toBe("some(a,b)");
	});

	it("passes if first middleware passes", async () => {
		const server = createTestServer();
		server.tool(
			"api",
			some(pass("a"), block("b")),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		const t = await createTestClient(server);
		const result = await t.callTool("api", {});
		expect(result.isError).toBeUndefined();
		expect((result.content as any)[0].text).toBe("ok");

		await t.close();
	});

	it("falls through to second if first blocks", async () => {
		const server = createTestServer();
		server.tool(
			"api",
			some(block("a"), pass("b")),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		const t = await createTestClient(server);
		const result = await t.callTool("api", {});
		expect(result.isError).toBeUndefined();
		expect((result.content as any)[0].text).toBe("ok");

		await t.close();
	});

	it("returns last error if all block", async () => {
		const server = createTestServer();
		server.tool(
			"api",
			some(block("a", "error-a"), block("b", "error-b")),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		const t = await createTestClient(server);
		const result = await t.callTool("api", {});
		expect(result.isError).toBe(true);
		expect((result.content as any)[0].text).toBe("error-b");

		await t.close();
	});

	it("onRegister returns false if any inner middleware returns false", () => {
		const hidden: ToolMiddleware = {
			name: "hidden",
			onRegister() {
				return false;
			},
		};
		const mw = some(pass("a"), hidden);
		const result = mw.onRegister?.({
			name: "test",
			middlewares: [],
		});
		expect(result).toBe(false);
	});
});

describe("every()", () => {
	it("generates correct name", () => {
		const mw = every(pass("a"), pass("b"));
		expect(mw.name).toBe("every(a,b)");
	});

	it("passes if all middlewares pass", async () => {
		const server = createTestServer();
		server.tool(
			"api",
			every(pass("a"), pass("b")),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		const t = await createTestClient(server);
		const result = await t.callTool("api", {});
		expect(result.isError).toBeUndefined();
		expect((result.content as any)[0].text).toBe("ok");

		await t.close();
	});

	it("stops at first blocking middleware", async () => {
		const server = createTestServer();
		server.tool(
			"api",
			every(block("a", "stopped"), pass("b")),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		const t = await createTestClient(server);
		const result = await t.callTool("api", {});
		expect(result.isError).toBe(true);
		expect((result.content as any)[0].text).toBe("stopped");

		await t.close();
	});

	it("onRegister returns false if any inner middleware returns false", () => {
		const hidden: ToolMiddleware = {
			name: "hidden",
			onRegister() {
				return false;
			},
		};
		const mw = every(pass("a"), hidden);
		const result = mw.onRegister?.({
			name: "test",
			middlewares: [],
		});
		expect(result).toBe(false);
	});

	it("runs onResult hooks in reverse order", async () => {
		const order: string[] = [];
		const mwA: ToolMiddleware = {
			name: "a",
			async onCall(_c, next) {
				return next();
			},
			onResult(result) {
				order.push("a");
				return result;
			},
		};
		const mwB: ToolMiddleware = {
			name: "b",
			async onCall(_c, next) {
				return next();
			},
			onResult(result) {
				order.push("b");
				return result;
			},
		};

		const server = createTestServer();
		server.tool("api", every(mwA, mwB), { input: z.object({}) }, async () =>
			text("ok"),
		);

		const t = await createTestClient(server);
		await t.callTool("api", {});

		expect(order).toEqual(["b", "a"]);

		await t.close();
	});
});

describe("except()", () => {
	it("generates correct name", () => {
		const mw = except(() => true, pass("inner"));
		expect(mw.name).toBe("except(inner)");
	});

	it("skips middleware when condition is true", async () => {
		const server = createTestServer();
		server.tool(
			"api",
			except(() => true, block("blocker")),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		const t = await createTestClient(server);
		const result = await t.callTool("api", {});
		expect(result.isError).toBeUndefined();
		expect((result.content as any)[0].text).toBe("ok");

		await t.close();
	});

	it("applies middleware when condition is false", async () => {
		const server = createTestServer();
		server.tool(
			"api",
			except(() => false, block("blocker", "blocked!")),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		const t = await createTestClient(server);
		const result = await t.callTool("api", {});
		expect(result.isError).toBe(true);
		expect((result.content as any)[0].text).toBe("blocked!");

		await t.close();
	});

	it("uses session state for condition", async () => {
		const server = createTestServer();
		server.tool(
			"api",
			except((c) => c.session.get("role") === "admin", rateLimit({ max: 1 })),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		const t = await createTestClient(server);

		// Without admin role, rate limit applies
		await t.callTool("api", {});
		const r2 = await t.callTool("api", {});
		expect(r2.isError).toBe(true);

		// Set admin role — rate limit skipped
		t.session.set("role", "admin");
		const r3 = await t.callTool("api", {});
		expect(r3.isError).toBeUndefined();

		await t.close();
	});

	it("delegates onRegister to inner middleware", () => {
		const hidden: ToolMiddleware = {
			name: "hidden",
			onRegister() {
				return false;
			},
		};
		const mw = except(() => true, hidden);
		const result = mw.onRegister?.({
			name: "test",
			middlewares: [],
		});
		expect(result).toBe(false);
	});
});
