import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../../src/core.js";
import { retry } from "../../src/middleware/retry.js";
import { error, text } from "../../src/response.js";
import { createTestClient } from "../../src/test.js";

function createTestServer() {
	return createMCPServer({ name: "test", version: "1.0.0" }) as any;
}

describe("retry middleware", () => {
	it("has correct name", () => {
		const mw = retry();
		expect(mw.name).toBe("retry");
	});

	it("returns success on first attempt", async () => {
		const server = createTestServer();
		server.tool("ok", retry(), { input: z.object({}) }, async () =>
			text("done"),
		);

		const t = await createTestClient(server);
		const r = await t.callToolText("ok", {});
		expect(r).toBe("done");
		await t.close();
	});

	it("retries on error result and succeeds", async () => {
		let attempt = 0;
		const server = createTestServer();
		server.tool(
			"flaky",
			retry({ max: 3, delayMs: 0 }),
			{ input: z.object({}) },
			async () => {
				attempt++;
				if (attempt < 3) return error("fail");
				return text("ok");
			},
		);

		const t = await createTestClient(server);
		const r = await t.callToolText("flaky", {});
		expect(r).toBe("ok");
		expect(attempt).toBe(3);
		await t.close();
	});

	it("returns last error after exhausting attempts", async () => {
		const server = createTestServer();
		server.tool(
			"always-fail",
			retry({ max: 2, delayMs: 0 }),
			{ input: z.object({}) },
			async () => error("nope"),
		);

		const t = await createTestClient(server);
		const r = await t.callTool("always-fail", {});
		expect(r.isError).toBe(true);
		await t.close();
	});

	it("retries on thrown errors", async () => {
		let attempt = 0;
		const server = createTestServer();
		server.tool(
			"throws",
			retry({ max: 3, delayMs: 0 }),
			{ input: z.object({}) },
			async () => {
				attempt++;
				if (attempt < 3) throw new Error("boom");
				return text("recovered");
			},
		);

		const t = await createTestClient(server);
		const r = await t.callToolText("throws", {});
		expect(r).toBe("recovered");
		expect(attempt).toBe(3);
		await t.close();
	});

	it("re-throws if all attempts throw", async () => {
		const server = createTestServer();
		server.tool(
			"always-throws",
			retry({ max: 2, delayMs: 0 }),
			{ input: z.object({}) },
			async () => {
				throw new Error("fatal");
			},
		);

		const t = await createTestClient(server);
		await expect(t.callTool("always-throws", {})).rejects.toThrow("fatal");
		await t.close();
	});

	it("max: 1 means no retries", async () => {
		let callCount = 0;
		const server = createTestServer();
		server.tool(
			"once",
			retry({ max: 1, delayMs: 0 }),
			{ input: z.object({}) },
			async () => {
				callCount++;
				return error("fail");
			},
		);

		const t = await createTestClient(server);
		const r = await t.callTool("once", {});
		expect(r.isError).toBe(true);
		expect(callCount).toBe(1);
		await t.close();
	});

	it("custom shouldRetry function", async () => {
		let attempt = 0;
		const server = createTestServer();
		server.tool(
			"custom",
			retry({
				max: 3,
				delayMs: 0,
				shouldRetry: (r) =>
					!r.isError && (r.content as any)?.[0]?.text === "retry-me",
			}),
			{ input: z.object({}) },
			async () => {
				attempt++;
				if (attempt < 2) return text("retry-me");
				return text("done");
			},
		);

		const t = await createTestClient(server);
		const r = await t.callToolText("custom", {});
		expect(r).toBe("done");
		expect(attempt).toBe(2);
		await t.close();
	});

	it("applies exponential backoff", async () => {
		vi.useFakeTimers();
		try {
			let attempt = 0;
			const server = createTestServer();
			server.tool(
				"backoff",
				retry({ max: 3, delayMs: 100, backoff: "exponential" }),
				{ input: z.object({}) },
				async () => {
					attempt++;
					if (attempt < 3) return error("fail");
					return text("ok");
				},
			);

			const t = await createTestClient(server);
			const promise = t.callToolText("backoff", {});

			// First attempt immediate, then 100ms delay, then 200ms delay
			await vi.advanceTimersByTimeAsync(100); // 1st retry (100ms)
			await vi.advanceTimersByTimeAsync(200); // 2nd retry (200ms)

			const r = await promise;
			expect(r).toBe("ok");
			expect(attempt).toBe(3);
			await t.close();
		} finally {
			vi.useRealTimers();
		}
	});

	it("applies linear backoff", async () => {
		vi.useFakeTimers();
		try {
			let attempt = 0;
			const server = createTestServer();
			server.tool(
				"linear",
				retry({ max: 3, delayMs: 100, backoff: "linear" }),
				{ input: z.object({}) },
				async () => {
					attempt++;
					if (attempt < 3) return error("fail");
					return text("ok");
				},
			);

			const t = await createTestClient(server);
			const promise = t.callToolText("linear", {});

			// First attempt immediate, then 100ms, then 200ms
			await vi.advanceTimersByTimeAsync(100); // 1st retry (100*1)
			await vi.advanceTimersByTimeAsync(200); // 2nd retry (100*2)

			const r = await promise;
			expect(r).toBe("ok");
			expect(attempt).toBe(3);
			await t.close();
		} finally {
			vi.useRealTimers();
		}
	});
});
