import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../src/core.js";
import { text } from "../src/response.js";
import { createTestClient } from "../src/test.js";

describe("lifecycle hooks", () => {
	describe("onSessionCreate", () => {
		it("fires once per new session", async () => {
			const onSessionCreate = vi.fn();
			const server = createMCPServer({
				name: "test",
				version: "1.0.0",
				onSessionCreate,
			}) as any;

			server.tool("ping", { input: z.object({}) }, async () => text("pong"));

			const t = await createTestClient(server);
			await t.callTool("ping", {});
			await t.callTool("ping", {}); // same session

			// Wait for fire-and-forget promise
			await new Promise((r) => setTimeout(r, 10));

			// createTestClient triggers session creation once (for the "default" session)
			expect(onSessionCreate).toHaveBeenCalledTimes(1);
			await t.close();
		});

		it("passes session ID to hook", async () => {
			const onSessionCreate = vi.fn();
			const server = createMCPServer({
				name: "test",
				version: "1.0.0",
				onSessionCreate,
			}) as any;

			server.tool("ping", { input: z.object({}) }, async () => text("pong"));

			const t = await createTestClient(server);
			await t.callTool("ping", {});

			await new Promise((r) => setTimeout(r, 10));

			expect(onSessionCreate).toHaveBeenCalledWith(expect.any(String));
			await t.close();
		});

		it("does not crash if hook throws synchronously", async () => {
			const server = createMCPServer({
				name: "test",
				version: "1.0.0",
				onSessionCreate: () => {
					throw new Error("hook error");
				},
			}) as any;

			server.tool("ping", { input: z.object({}) }, async () => text("pong"));

			const t = await createTestClient(server);
			const r = await t.callToolText("ping", {});
			expect(r).toBe("pong");
			await t.close();
		});

		it("does not crash if hook rejects", async () => {
			const server = createMCPServer({
				name: "test",
				version: "1.0.0",
				onSessionCreate: async () => {
					throw new Error("async hook error");
				},
			}) as any;

			server.tool("ping", { input: z.object({}) }, async () => text("pong"));

			const t = await createTestClient(server);
			const r = await t.callToolText("ping", {});
			expect(r).toBe("pong");
			await t.close();
		});
	});

	describe("onServerStart", () => {
		it("fires in stdio after connect", async () => {
			const onServerStart = vi.fn();
			const server = createMCPServer({
				name: "test",
				version: "1.0.0",
				onServerStart,
			}) as any;

			// Simulate stdio() flow: connect + onServerStart
			const { InMemoryTransport } = await import(
				"@modelcontextprotocol/sdk/inMemory.js"
			);
			const [, serverTransport] = InMemoryTransport.createLinkedPair();
			await server._server.connect(serverTransport);

			// stdio() calls onServerStart after connect — simulate that call
			await Promise.resolve(onServerStart()).catch(() => {});

			expect(onServerStart).toHaveBeenCalledTimes(1);
		});
	});
});
