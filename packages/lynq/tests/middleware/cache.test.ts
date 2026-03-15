import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../../src/core.js";
import { cache } from "../../src/middleware/cache.js";
import { text } from "../../src/response.js";
import { memoryStore } from "../../src/store.js";
import { createTestClient } from "../../src/test.js";

function createTestServer(store = memoryStore()) {
	return createMCPServer({ name: "test", version: "1.0.0", store }) as any;
}

describe("cache middleware", () => {
	it("has correct name", () => {
		const mw = cache({ ttl: 60 });
		expect(mw.name).toBe("cache");
	});

	it("caches successful results", async () => {
		const handler = vi.fn(async () => text("hello"));
		const server = createTestServer();
		server.tool("greet", cache({ ttl: 60 }), { input: z.object({}) }, handler);

		const t = await createTestClient(server);
		const r1 = await t.callToolText("greet", {});
		expect(r1).toBe("hello");
		expect(handler).toHaveBeenCalledTimes(1);

		const r2 = await t.callToolText("greet", {});
		expect(r2).toBe("hello");
		expect(handler).toHaveBeenCalledTimes(1); // still 1 — served from cache

		await t.close();
	});

	it("does not cache error results", async () => {
		let callCount = 0;
		const server = createTestServer();
		server.tool(
			"fail",
			cache({ ttl: 60 }),
			{ input: z.object({}) },
			async () => {
				callCount++;
				return {
					isError: true,
					content: [{ type: "text" as const, text: "err" }],
				};
			},
		);

		const t = await createTestClient(server);
		await t.callTool("fail", {});
		await t.callTool("fail", {});
		expect(callCount).toBe(2); // not cached

		await t.close();
	});

	it("uses different cache keys for different args", async () => {
		const handler = vi.fn(async (args: { name: string }) =>
			text(`hi ${args.name}`),
		);
		const server = createTestServer();
		server.tool(
			"greet",
			cache({ ttl: 60 }),
			{ input: z.object({ name: z.string() }) },
			handler,
		);

		const t = await createTestClient(server);
		await t.callToolText("greet", { name: "alice" });
		await t.callToolText("greet", { name: "bob" });
		expect(handler).toHaveBeenCalledTimes(2);

		// Same args should be cached
		await t.callToolText("greet", { name: "alice" });
		expect(handler).toHaveBeenCalledTimes(2);

		await t.close();
	});

	it("expires after TTL", async () => {
		vi.useFakeTimers();
		try {
			const handler = vi.fn(async () => text("ok"));
			const server = createTestServer();
			server.tool("api", cache({ ttl: 5 }), { input: z.object({}) }, handler);

			const t = await createTestClient(server);
			await t.callTool("api", {});
			expect(handler).toHaveBeenCalledTimes(1);

			await t.callTool("api", {});
			expect(handler).toHaveBeenCalledTimes(1); // cached

			vi.advanceTimersByTime(5001);

			await t.callTool("api", {});
			expect(handler).toHaveBeenCalledTimes(2); // expired, re-fetched

			await t.close();
		} finally {
			vi.useRealTimers();
		}
	});

	it("treats args with different key order as same cache entry", async () => {
		const handler = vi.fn(async (args: { a: number; b: number }) =>
			text(`${args.a + args.b}`),
		);
		const server = createTestServer();
		server.tool(
			"add",
			cache({ ttl: 60 }),
			{ input: z.object({ a: z.number(), b: z.number() }) },
			handler,
		);

		const t = await createTestClient(server);
		await t.callToolText("add", { a: 1, b: 2 });
		expect(handler).toHaveBeenCalledTimes(1);

		// Same values, different key order — should hit cache
		await t.callToolText("add", { b: 2, a: 1 });
		expect(handler).toHaveBeenCalledTimes(1);

		await t.close();
	});

	it("supports custom key function", async () => {
		const handler = vi.fn(async () => text("ok"));
		const server = createTestServer();
		server.tool(
			"api",
			cache({ ttl: 60, key: (name) => `custom:${name}` }),
			{ input: z.object({ q: z.string() }) },
			handler,
		);

		const t = await createTestClient(server);
		await t.callTool("api", { q: "a" });
		await t.callTool("api", { q: "b" }); // same custom key (ignores args)
		expect(handler).toHaveBeenCalledTimes(1);

		await t.close();
	});

	it("works as global middleware", async () => {
		const handler = vi.fn(async () => text("ok"));
		const server = createTestServer();
		server.use(cache({ ttl: 60 }));
		server.tool("api", { input: z.object({}) }, handler);

		const t = await createTestClient(server);
		await t.callTool("api", {});
		await t.callTool("api", {});
		expect(handler).toHaveBeenCalledTimes(1);

		await t.close();
	});
});
