import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../../src/core.js";
import { logger } from "../../src/middleware/logger.js";
import { error, text } from "../../src/response.js";
import { createTestClient } from "../../src/test.js";

function createTestServer() {
	return createMCPServer({ name: "test", version: "1.0.0" }) as any;
}

describe("logger middleware", () => {
	it("logs tool call and completion", async () => {
		const log = vi.fn();
		const server = createTestServer();

		server.tool(
			"greet",
			logger({ log }),
			{ input: z.object({ name: z.string() }) },
			async (args: any) => text(`Hello ${args.name}`),
		);

		const t = await createTestClient(server);
		await t.callTool("greet", { name: "Alice" });

		expect(log).toHaveBeenCalledTimes(2);
		expect(log.mock.calls[0][0]).toContain("[greet] called");
		expect(log.mock.calls[0][0]).toContain("session:");
		expect(log.mock.calls[1][0]).toMatch(/\[greet\] \d+\.\d+ms$/);

		await t.close();
	});

	it("logs ERROR suffix when handler returns error", async () => {
		const log = vi.fn();
		const server = createTestServer();

		server.tool("fail", logger({ log }), { input: z.object({}) }, async () =>
			error("Something broke"),
		);

		const t = await createTestClient(server);
		await t.callTool("fail", {});

		expect(log).toHaveBeenCalledTimes(2);
		expect(log.mock.calls[1][0]).toContain("ERROR");

		await t.close();
	});

	it("uses console.log by default", () => {
		const mw = logger();
		expect(mw.name).toBe("logger");
	});

	it("works as global middleware", async () => {
		const log = vi.fn();
		const server = createTestServer();

		server.use(logger({ log }));

		server.tool("a", { input: z.object({}) }, async () => text("ok"));
		server.tool("b", { input: z.object({}) }, async () => text("ok"));

		const t = await createTestClient(server);
		await t.callTool("a", {});
		await t.callTool("b", {});

		// 2 calls per tool (start + end) × 2 tools = 4
		expect(log).toHaveBeenCalledTimes(4);
		expect(log.mock.calls[0][0]).toContain("[a]");
		expect(log.mock.calls[2][0]).toContain("[b]");

		await t.close();
	});
});
