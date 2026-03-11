import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../../src/core.js";
import { oauth } from "../../src/middleware/oauth.js";
import { text } from "../../src/response.js";

function createTestServer() {
	return createMCPServer({ name: "test", version: "1.0.0" }) as any;
}

describe("oauth middleware", () => {
	it("has correct default name", () => {
		const mw = oauth({
			buildUrl: () => "https://example.com",
		});
		expect(mw.name).toBe("oauth");
	});

	it("uses custom name", () => {
		const mw = oauth({
			name: "github-oauth",
			buildUrl: () => "https://example.com",
		});
		expect(mw.name).toBe("github-oauth");
	});

	it("hides tools on registration", () => {
		const server = createTestServer();
		const mw = oauth({
			buildUrl: () => "https://example.com",
		});
		server.tool("data", mw, { input: z.object({}) }, async () => text("ok"));
		expect(server._isToolVisible("data", "s1")).toBe(false);
	});

	it("skips when user session key is present", async () => {
		const server = createTestServer();
		const mw = oauth({
			buildUrl: () => "https://example.com",
		});
		server.tool("data", mw, { input: z.object({}) }, async () => text("ok"));

		const session = server._createSessionAPI("default");
		session.set("user", { id: 1 });
		session.authorize("oauth");

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
			server._server.connect(serverTransport),
			client.connect(clientTransport),
		]);

		const result = await client.callTool({ name: "data", arguments: {} });
		expect((result as any).content[0].text).toBe("ok");
	});

	it("uses custom sessionKey", () => {
		const mw = oauth({
			sessionKey: "token",
			buildUrl: () => "https://example.com",
		});
		expect(mw.name).toBe("oauth");
	});
});
