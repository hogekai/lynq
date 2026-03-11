import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../../src/core.js";
import { truncate } from "../../src/middleware/truncate.js";
import { text } from "../../src/response.js";
import { createTestClient } from "../../src/test.js";

function createTestServer() {
	return createMCPServer({ name: "test", version: "1.0.0" }) as any;
}

describe("truncate middleware", () => {
	it("truncates text exceeding maxChars", async () => {
		const server = createTestServer();
		server.tool(
			"long",
			truncate({ maxChars: 10 }),
			{ input: z.object({}) },
			async () => text("Hello, this is a very long response"),
		);

		const t = await createTestClient(server);
		const result = await t.callTool("long", {});

		const content = (result.content as any)[0].text;
		expect(content).toBe("Hello, ..."); // 7 chars + "..."
		expect(content.length).toBe(10);

		await t.close();
	});

	it("does not truncate text within limit", async () => {
		const server = createTestServer();
		server.tool(
			"short",
			truncate({ maxChars: 100 }),
			{ input: z.object({}) },
			async () => text("Hello"),
		);

		const t = await createTestClient(server);
		const result = await t.callTool("short", {});

		expect((result.content as any)[0].text).toBe("Hello");

		await t.close();
	});

	it("uses custom suffix", async () => {
		const server = createTestServer();
		server.tool(
			"custom",
			truncate({ maxChars: 10, suffix: " [cut]" }),
			{ input: z.object({}) },
			async () => text("Hello, this is very long"),
		);

		const t = await createTestClient(server);
		const result = await t.callTool("custom", {});

		const content = (result.content as any)[0].text;
		expect(content).toBe("Hell [cut]");
		expect(content.length).toBe(10);

		await t.close();
	});

	it("has correct middleware name", () => {
		const mw = truncate({ maxChars: 100 });
		expect(mw.name).toBe("truncate");
	});

	it("does not affect non-text content blocks", async () => {
		const server = createTestServer();
		server.tool(
			"mixed",
			truncate({ maxChars: 5 }),
			{ input: z.object({}) },
			async () => ({
				content: [
					{ type: "text", text: "Hello, world!" },
					{ type: "image", data: "longbase64data", mimeType: "image/png" },
				],
			}),
		);

		const t = await createTestClient(server);
		const result = await t.callTool("mixed", {});

		const content = result.content as any[];
		expect(content[0].text).toBe("He...");
		expect(content[1].data).toBe("longbase64data");

		await t.close();
	});
});
