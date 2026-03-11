import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../src/core.js";
import { error, text } from "../src/response.js";
import type { ToolMiddleware } from "../src/types.js";

function createTestServer() {
	return createMCPServer({ name: "test", version: "1.0.0" }) as any;
}

async function createConnectedPair(
	server: any,
	elicitHandler: (request: any) => any,
) {
	const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
	const { InMemoryTransport } = await import(
		"@modelcontextprotocol/sdk/inMemory.js"
	);
	const { ElicitRequestSchema } = await import(
		"@modelcontextprotocol/sdk/types.js"
	);
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	const client = new Client(
		{ name: "test-client", version: "1.0.0" },
		{ capabilities: { elicitation: { form: {}, url: {} } } },
	);
	client.setRequestHandler(ElicitRequestSchema, elicitHandler);
	await Promise.all([
		server._server.connect(serverTransport),
		client.connect(clientTransport),
	]);
	return client;
}

describe("elicitation — form mode", () => {
	it("c.elicit.form() returns accepted content", async () => {
		const server = createTestServer();
		server.tool(
			"setup",
			{ description: "Setup", input: z.object({}) },
			async (_args: any, c: any) => {
				const result = await c.elicit.form(
					"Enter API key",
					z.object({
						apiKey: z.string().describe("Your API key"),
					}),
				);
				return text(`${result.action}:${result.content.apiKey}`);
			},
		);

		const client = await createConnectedPair(server, async (request: any) => {
			expect(request.params.message).toBe("Enter API key");
			expect(request.params.requestedSchema.properties.apiKey.type).toBe(
				"string",
			);
			return { action: "accept", content: { apiKey: "sk-123" } };
		});

		const result = await client.callTool({ name: "setup", arguments: {} });
		expect((result as any).content[0].text).toBe("accept:sk-123");
	});

	it("c.elicit.form() propagates decline", async () => {
		const server = createTestServer();
		server.tool(
			"setup",
			{ description: "Setup", input: z.object({}) },
			async (_args: any, c: any) => {
				const result = await c.elicit.form(
					"Enter key",
					z.object({
						key: z.string(),
					}),
				);
				return text(result.action);
			},
		);

		const client = await createConnectedPair(server, async () => ({
			action: "decline",
		}));

		const result = await client.callTool({ name: "setup", arguments: {} });
		expect((result as any).content[0].text).toBe("decline");
	});

	it("c.elicit.form() propagates cancel", async () => {
		const server = createTestServer();
		server.tool(
			"setup",
			{ description: "Setup", input: z.object({}) },
			async (_args: any, c: any) => {
				const result = await c.elicit.form(
					"Enter key",
					z.object({
						key: z.string(),
					}),
				);
				return text(result.action);
			},
		);

		const client = await createConnectedPair(server, async () => ({
			action: "cancel",
		}));

		const result = await client.callTool({ name: "setup", arguments: {} });
		expect((result as any).content[0].text).toBe("cancel");
	});
});

describe("elicitation — url mode", () => {
	it("c.elicit.url() returns action only", async () => {
		const server = createTestServer();
		server.tool(
			"login",
			{ description: "Login", input: z.object({}) },
			async (_args: any, c: any) => {
				const result = await c.elicit.url(
					"Complete auth",
					"https://auth.example.com/oauth",
				);
				return text(`${result.action}:${result.content === undefined}`);
			},
		);

		const client = await createConnectedPair(server, async (request: any) => {
			expect(request.params.mode).toBe("url");
			expect(request.params.url).toBe("https://auth.example.com/oauth");
			expect(request.params.elicitationId).toBeDefined();
			return { action: "accept" };
		});

		const result = await client.callTool({ name: "login", arguments: {} });
		expect((result as any).content[0].text).toBe("accept:true");
	});

	it("c.elicit.url() propagates decline", async () => {
		const server = createTestServer();
		server.tool(
			"login",
			{ description: "Login", input: z.object({}) },
			async (_args: any, c: any) => {
				const result = await c.elicit.url("Auth", "https://example.com");
				return text(result.action);
			},
		);

		const client = await createConnectedPair(server, async () => ({
			action: "decline",
		}));

		const result = await client.callTool({ name: "login", arguments: {} });
		expect((result as any).content[0].text).toBe("decline");
	});
});

describe("elicitation — middleware", () => {
	it("middleware can use c.elicit.form()", async () => {
		const server = createTestServer();

		const apiKeyMw: ToolMiddleware = {
			name: "apiKey",
			onRegister: () => undefined,
			async onCall(c, next) {
				if (!c.session.get("apiKey")) {
					const result = await c.elicit.form(
						"API key required",
						z.object({
							apiKey: z.string(),
						}),
					);
					if (result.action !== "accept") {
						return error("key required");
					}
					c.session.set("apiKey", result.content.apiKey);
				}
				return next();
			},
		};

		server.tool(
			"query",
			apiKeyMw,
			{ description: "Query", input: z.object({}) },
			async (_args: any, c: any) => text(`key=${c.session.get("apiKey")}`),
		);

		const client = await createConnectedPair(server, async () => ({
			action: "accept",
			content: { apiKey: "mw-key-123" },
		}));

		const result = await client.callTool({ name: "query", arguments: {} });
		expect((result as any).content[0].text).toBe("key=mw-key-123");
	});
});
