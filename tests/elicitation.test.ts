import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../src/core.js";
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
	it("ctx.elicit.form() returns accepted content", async () => {
		const server = createTestServer();
		server.tool(
			"setup",
			{ description: "Setup", input: z.object({}) },
			async (_args: any, ctx: any) => {
				const result = await ctx.elicit.form({
					message: "Enter API key",
					schema: {
						apiKey: { type: "string", description: "Your API key" },
					},
				});
				return {
					content: [
						{ type: "text", text: `${result.action}:${result.content.apiKey}` },
					],
				};
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

	it("ctx.elicit.form() propagates decline", async () => {
		const server = createTestServer();
		server.tool(
			"setup",
			{ description: "Setup", input: z.object({}) },
			async (_args: any, ctx: any) => {
				const result = await ctx.elicit.form({
					message: "Enter key",
					schema: { key: { type: "string" } },
				});
				return { content: [{ type: "text", text: result.action }] };
			},
		);

		const client = await createConnectedPair(server, async () => ({
			action: "decline",
		}));

		const result = await client.callTool({ name: "setup", arguments: {} });
		expect((result as any).content[0].text).toBe("decline");
	});

	it("ctx.elicit.form() propagates cancel", async () => {
		const server = createTestServer();
		server.tool(
			"setup",
			{ description: "Setup", input: z.object({}) },
			async (_args: any, ctx: any) => {
				const result = await ctx.elicit.form({
					message: "Enter key",
					schema: { key: { type: "string" } },
				});
				return { content: [{ type: "text", text: result.action }] };
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
	it("ctx.elicit.url() returns action only", async () => {
		const server = createTestServer();
		server.tool(
			"login",
			{ description: "Login", input: z.object({}) },
			async (_args: any, ctx: any) => {
				const result = await ctx.elicit.url({
					message: "Complete auth",
					url: "https://auth.example.com/oauth",
				});
				return {
					content: [
						{
							type: "text",
							text: `${result.action}:${result.content === undefined}`,
						},
					],
				};
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

	it("ctx.elicit.url() propagates decline", async () => {
		const server = createTestServer();
		server.tool(
			"login",
			{ description: "Login", input: z.object({}) },
			async (_args: any, ctx: any) => {
				const result = await ctx.elicit.url({
					message: "Auth",
					url: "https://example.com",
				});
				return { content: [{ type: "text", text: result.action }] };
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
	it("middleware can use ctx.elicit.form()", async () => {
		const server = createTestServer();

		const apiKeyMw: ToolMiddleware = {
			name: "apiKey",
			onRegister: () => undefined,
			async onCall(ctx, next) {
				if (!ctx.session.get("apiKey")) {
					const result = await ctx.elicit.form({
						message: "API key required",
						schema: { apiKey: { type: "string" } },
					});
					if (result.action !== "accept") {
						return {
							content: [{ type: "text", text: "key required" }],
							isError: true,
						};
					}
					ctx.session.set("apiKey", result.content.apiKey);
				}
				return next();
			},
		};

		server.tool(
			"query",
			apiKeyMw,
			{ description: "Query", input: z.object({}) },
			async (_args: any, ctx: any) => ({
				content: [{ type: "text", text: `key=${ctx.session.get("apiKey")}` }],
			}),
		);

		const client = await createConnectedPair(server, async () => ({
			action: "accept",
			content: { apiKey: "mw-key-123" },
		}));

		const result = await client.callTool({ name: "query", arguments: {} });
		expect((result as any).content[0].text).toBe("key=mw-key-123");
	});
});
