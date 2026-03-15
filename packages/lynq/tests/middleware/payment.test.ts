import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../../src/core.js";
import { getInternals } from "../../src/internals.js";
import { payment } from "../../src/middleware/payment.js";
import { text } from "../../src/response.js";

function createTestServer() {
	return createMCPServer({ name: "test", version: "1.0.0" }) as any;
}

describe("payment middleware", () => {
	it("has correct default name", () => {
		const mw = payment({
			buildUrl: () => "https://example.com",
		});
		expect(mw.name).toBe("payment");
	});

	it("uses custom name", () => {
		const mw = payment({
			name: "stripe",
			buildUrl: () => "https://example.com",
		});
		expect(mw.name).toBe("stripe");
	});

	it("hides tools on registration", () => {
		const server = createTestServer();
		const mw = payment({
			buildUrl: () => "https://example.com",
		});
		server.tool("premium", mw, { input: z.object({}) }, async () => text("ok"));
		expect(getInternals(server).isToolVisible("premium", "s1")).toBe(false);
	});

	it("uses 'payment' as default sessionKey", async () => {
		const server = createTestServer();
		const mw = payment({
			buildUrl: () => "https://example.com",
		});
		server.tool("premium", mw, { input: z.object({}) }, async () => text("ok"));

		// Setting the "payment" key + authorize should allow access
		const session = getInternals(server).createSessionAPI("default");
		session.set("payment", { paid: true });
		session.authorize("payment");

		const { Client } = await import(
			"@modelcontextprotocol/sdk/client/index.js"
		);
		const { InMemoryTransport } = await import(
			"@modelcontextprotocol/sdk/inMemory.js"
		);
		const { ElicitRequestSchema } = await import(
			"@modelcontextprotocol/sdk/types.js"
		);
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		const client = new Client(
			{ name: "test", version: "1.0.0" },
			{ capabilities: { elicitation: { form: {}, url: {} } } },
		);
		client.setRequestHandler(ElicitRequestSchema, async () => ({
			action: "accept" as const,
		}));
		await Promise.all([
			getInternals(server).server.connect(serverTransport),
			client.connect(clientTransport),
		]);

		const result = await client.callTool({ name: "premium", arguments: {} });
		expect((result as any).content[0].text).toBe("ok");
	});
});
