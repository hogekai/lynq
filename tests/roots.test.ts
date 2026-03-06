import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../src/core.js";
import { error, text } from "../src/response.js";

function createTestServer() {
	return createMCPServer({ name: "test", version: "1.0.0" }) as any;
}

async function createConnectedPair(
	server: any,
	opts: { roots?: Array<{ uri: string; name?: string }> } = {},
) {
	const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
	const { InMemoryTransport } = await import(
		"@modelcontextprotocol/sdk/inMemory.js"
	);
	const { ListRootsRequestSchema } = await import(
		"@modelcontextprotocol/sdk/types.js"
	);
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();

	const capabilities = opts.roots ? { roots: { listChanged: true } } : {};

	const client = new Client(
		{ name: "test-client", version: "1.0.0" },
		{ capabilities },
	);

	if (opts.roots) {
		client.setRequestHandler(ListRootsRequestSchema, async () => ({
			roots: opts.roots!,
		}));
	}

	await Promise.all([
		server._server.connect(serverTransport),
		client.connect(clientTransport),
	]);
	return client;
}

describe("ctx.roots()", () => {
	it("returns roots provided by client", async () => {
		const server = createTestServer();
		server.tool(
			"check",
			{ description: "Check", input: z.object({}) },
			async (_args: any, ctx: any) => {
				const roots = await ctx.roots();
				return text(JSON.stringify(roots));
			},
		);

		const client = await createConnectedPair(server, {
			roots: [
				{ uri: "file:///home/user/project", name: "My Project" },
				{ uri: "file:///home/user/data" },
			],
		});

		const result = await client.callTool({ name: "check", arguments: {} });
		const roots = JSON.parse((result as any).content[0].text);
		expect(roots).toEqual([
			{ uri: "file:///home/user/project", name: "My Project" },
			{ uri: "file:///home/user/data" },
		]);
	});

	it("returns empty array when client lacks roots capability", async () => {
		const server = createTestServer();
		server.tool(
			"check",
			{ description: "Check", input: z.object({}) },
			async (_args: any, ctx: any) => {
				const roots = await ctx.roots();
				return text(JSON.stringify(roots));
			},
		);

		const client = await createConnectedPair(server);

		const result = await client.callTool({ name: "check", arguments: {} });
		const roots = JSON.parse((result as any).content[0].text);
		expect(roots).toEqual([]);
	});

	it("returns empty array for client with empty roots list", async () => {
		const server = createTestServer();
		server.tool(
			"check",
			{ description: "Check", input: z.object({}) },
			async (_args: any, ctx: any) => {
				const roots = await ctx.roots();
				return text(String(roots.length));
			},
		);

		const client = await createConnectedPair(server, { roots: [] });

		const result = await client.callTool({ name: "check", arguments: {} });
		expect((result as any).content[0].text).toBe("0");
	});
});
