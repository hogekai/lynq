import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../../src/core.js";
import { rateLimit } from "../../src/middleware/rate-limit.js";
import { text } from "../../src/response.js";
import { memoryStore } from "../../src/store.js";
import { createTestClient } from "../../src/test.js";

function createTestServer(store = memoryStore()) {
	return createMCPServer({ name: "test", version: "1.0.0", store }) as any;
}

describe("rateLimit middleware", () => {
	it("allows calls within the limit", async () => {
		const server = createTestServer();
		server.tool(
			"api",
			rateLimit({ max: 3 }),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		const t = await createTestClient(server);

		const r1 = await t.callTool("api", {});
		const r2 = await t.callTool("api", {});
		const r3 = await t.callTool("api", {});

		expect(r1.isError).toBeUndefined();
		expect(r2.isError).toBeUndefined();
		expect(r3.isError).toBeUndefined();

		await t.close();
	});

	it("blocks calls exceeding the limit", async () => {
		const server = createTestServer();
		server.tool(
			"api",
			rateLimit({ max: 2 }),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		const t = await createTestClient(server);

		await t.callTool("api", {});
		await t.callTool("api", {});
		const r3 = await t.callTool("api", {});

		expect(r3.isError).toBe(true);
		expect((r3.content as any)[0].text).toContain("Rate limit exceeded");

		await t.close();
	});

	it("resets after window expires", async () => {
		vi.useFakeTimers();

		const server = createTestServer();
		server.tool(
			"api",
			rateLimit({ max: 1, windowMs: 1000 }),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		const t = await createTestClient(server);

		const r1 = await t.callTool("api", {});
		expect(r1.isError).toBeUndefined();

		const r2 = await t.callTool("api", {});
		expect(r2.isError).toBe(true);

		// Advance time past the window
		vi.advanceTimersByTime(1001);

		const r3 = await t.callTool("api", {});
		expect(r3.isError).toBeUndefined();

		await t.close();
		vi.useRealTimers();
	});

	it("counts per tool name", async () => {
		const server = createTestServer();
		const rl = rateLimit({ max: 1 });

		server.tool("tool-a", rl, { input: z.object({}) }, async () => text("a"));
		server.tool("tool-b", rl, { input: z.object({}) }, async () => text("b"));

		const t = await createTestClient(server);

		// First call to each should work
		const ra = await t.callTool("tool-a", {});
		const rb = await t.callTool("tool-b", {});
		expect(ra.isError).toBeUndefined();
		expect(rb.isError).toBeUndefined();

		// Second call to each should fail
		const ra2 = await t.callTool("tool-a", {});
		const rb2 = await t.callTool("tool-b", {});
		expect(ra2.isError).toBe(true);
		expect(rb2.isError).toBe(true);

		await t.close();
	});

	it("store: true shares rate limit across sessions (store-based)", async () => {
		const store = memoryStore();
		const server = createTestServer(store);
		server.tool(
			"api",
			rateLimit({ max: 2, store: true }),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		const t = await createTestClient(server);

		// All calls share the same store-based counter regardless of session
		await t.callTool("api", {});
		await t.callTool("api", {});
		const r = await t.callTool("api", {});
		expect(r.isError).toBe(true);

		await t.close();
	});

	it("perUser: true isolates limits by user", async () => {
		const store = memoryStore();
		const server = createTestServer(store);
		server.tool(
			"api",
			rateLimit({ max: 1, perUser: true }),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		// Test with user "alice"
		const t = await createTestClient(server);
		t.session.set("user", "alice");

		const r1 = await t.callTool("api", {});
		expect(r1.isError).toBeUndefined();

		const r2 = await t.callTool("api", {});
		expect(r2.isError).toBe(true);

		// Switch to "bob" — independent limit
		t.session.set("user", "bob");
		const r3 = await t.callTool("api", {});
		expect(r3.isError).toBeUndefined();

		const r4 = await t.callTool("api", {});
		expect(r4.isError).toBe(true);

		await t.close();
	});

	it("store-based resets after window expires", async () => {
		vi.useFakeTimers();
		try {
			const store = memoryStore();
			const server = createTestServer(store);
			server.tool(
				"api",
				rateLimit({ max: 1, windowMs: 1000, store: true }),
				{ input: z.object({}) },
				async () => text("ok"),
			);

			const t = await createTestClient(server);
			await t.callTool("api", {});
			const r = await t.callTool("api", {});
			expect(r.isError).toBe(true);

			vi.advanceTimersByTime(1001);
			const r2 = await t.callTool("api", {});
			expect(r2.isError).toBeUndefined();

			await t.close();
		} finally {
			vi.useRealTimers();
		}
	});

	it("uses custom error message", async () => {
		const server = createTestServer();
		server.tool(
			"api",
			rateLimit({ max: 1, message: "Too fast!" }),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		const t = await createTestClient(server);

		await t.callTool("api", {});
		const r2 = await t.callTool("api", {});

		expect((r2.content as any)[0].text).toBe("Too fast!");

		await t.close();
	});
});
