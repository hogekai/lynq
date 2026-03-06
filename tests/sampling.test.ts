import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../src/core.js";
import { text, error } from "../src/response.js";

function createTestServer() {
	return createMCPServer({ name: "test", version: "1.0.0" }) as any;
}

async function createConnectedPair(
	server: any,
	opts: {
		samplingHandler?: (req: any) => any;
	} = {},
) {
	const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
	const { InMemoryTransport } = await import(
		"@modelcontextprotocol/sdk/inMemory.js"
	);
	const { CreateMessageRequestSchema } = await import(
		"@modelcontextprotocol/sdk/types.js"
	);
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();

	const capabilities = opts.samplingHandler ? { sampling: {} } : {};

	const client = new Client(
		{ name: "test-client", version: "1.0.0" },
		{ capabilities },
	);

	if (opts.samplingHandler) {
		client.setRequestHandler(CreateMessageRequestSchema, opts.samplingHandler);
	}

	await Promise.all([
		server._server.connect(serverTransport),
		client.connect(clientTransport),
	]);
	return client;
}

describe("ctx.sample()", () => {
	it("returns text from client response", async () => {
		const server = createTestServer();
		server.tool(
			"test",
			{ description: "Test", input: z.object({ prompt: z.string() }) },
			async (args: any, ctx: any) => {
				const txt = await ctx.sample(args.prompt);
				return text(txt);
			},
		);

		const client = await createConnectedPair(server, {
			samplingHandler: async (req: any) => ({
				model: "test-model",
				role: "assistant",
				content: {
					type: "text",
					text: `Echo: ${req.params.messages[0].content.text}`,
				},
			}),
		});

		const result = await client.callTool({
			name: "test",
			arguments: { prompt: "hello" },
		});
		expect((result as any).content[0].text).toBe("Echo: hello");
	});

	it("forwards options to client", async () => {
		const server = createTestServer();
		let receivedParams: any;

		server.tool(
			"test",
			{ description: "Test", input: z.object({}) },
			async (_args: any, ctx: any) => {
				await ctx.sample("prompt", {
					maxTokens: 500,
					system: "Be brief.",
					temperature: 0.7,
					stopSequences: ["\n"],
				});
				return text("ok");
			},
		);

		const client = await createConnectedPair(server, {
			samplingHandler: async (req: any) => {
				receivedParams = req.params;
				return {
					model: "test-model",
					role: "assistant",
					content: { type: "text", text: "response" },
				};
			},
		});

		await client.callTool({ name: "test", arguments: {} });
		expect(receivedParams.maxTokens).toBe(500);
		expect(receivedParams.systemPrompt).toBe("Be brief.");
		expect(receivedParams.temperature).toBe(0.7);
		expect(receivedParams.stopSequences).toEqual(["\n"]);
	});

	it("maps model option to modelPreferences.hints", async () => {
		const server = createTestServer();
		let receivedParams: any;

		server.tool(
			"test",
			{ description: "Test", input: z.object({}) },
			async (_args: any, ctx: any) => {
				await ctx.sample("prompt", { model: "claude-opus-4-6" });
				return text("ok");
			},
		);

		const client = await createConnectedPair(server, {
			samplingHandler: async (req: any) => {
				receivedParams = req.params;
				return {
					model: "test-model",
					role: "assistant",
					content: { type: "text", text: "response" },
				};
			},
		});

		await client.callTool({ name: "test", arguments: {} });
		expect(receivedParams.modelPreferences).toEqual({
			hints: [{ name: "claude-opus-4-6" }],
		});
	});

	it("uses default maxTokens of 1024", async () => {
		const server = createTestServer();
		let receivedParams: any;

		server.tool(
			"test",
			{ description: "Test", input: z.object({}) },
			async (_args: any, ctx: any) => {
				await ctx.sample("prompt");
				return text("ok");
			},
		);

		const client = await createConnectedPair(server, {
			samplingHandler: async (req: any) => {
				receivedParams = req.params;
				return {
					model: "test-model",
					role: "assistant",
					content: { type: "text", text: "response" },
				};
			},
		});

		await client.callTool({ name: "test", arguments: {} });
		expect(receivedParams.maxTokens).toBe(1024);
	});

	it("returns empty string for non-text content", async () => {
		const server = createTestServer();
		server.tool(
			"test",
			{ description: "Test", input: z.object({}) },
			async (_args: any, ctx: any) => {
				const txt = await ctx.sample("prompt");
				return text(txt);
			},
		);

		const client = await createConnectedPair(server, {
			samplingHandler: async () => ({
				model: "test-model",
				role: "assistant",
				content: { type: "image", data: "base64data", mimeType: "image/png" },
			}),
		});

		const result = await client.callTool({ name: "test", arguments: {} });
		expect((result as any).content[0].text).toBe("");
	});
});

describe("ctx.sample.raw()", () => {
	it("returns full CreateMessageResult", async () => {
		const server = createTestServer();
		server.tool(
			"test",
			{ description: "Test", input: z.object({}) },
			async (_args: any, ctx: any) => {
				const result = await ctx.sample.raw({
					messages: [
						{ role: "user", content: { type: "text", text: "hello" } },
					],
					maxTokens: 100,
				});
				return text(JSON.stringify({
					model: result.model,
					role: result.role,
					contentType: result.content.type,
				}));
			},
		);

		const client = await createConnectedPair(server, {
			samplingHandler: async () => ({
				model: "test-model",
				role: "assistant",
				content: { type: "text", text: "hi" },
			}),
		});

		const result = await client.callTool({ name: "test", arguments: {} });
		const parsed = JSON.parse((result as any).content[0].text);
		expect(parsed).toEqual({
			model: "test-model",
			role: "assistant",
			contentType: "text",
		});
	});
});
