import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../../src/core.js";
import { urlAction } from "../../src/middleware/url-action.js";
import { text } from "../../src/response.js";

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

describe("urlAction middleware", () => {
	it("hides tools on registration", () => {
		const server = createTestServer();
		const mw = urlAction({
			message: "Auth",
			buildUrl: () => "https://example.com",
		});
		server.tool("secret", mw, { input: z.object({}) }, async () => text("ok"));
		expect(server._isToolVisible("secret", "s1")).toBe(false);
	});

	it("has correct default name", () => {
		const mw = urlAction({
			message: "Auth",
			buildUrl: () => "https://example.com",
		});
		expect(mw.name).toBe("url-action");
	});

	it("uses custom name", () => {
		const mw = urlAction({
			name: "my-action",
			message: "Auth",
			buildUrl: () => "https://example.com",
		});
		expect(mw.name).toBe("my-action");
	});

	it("skips elicitation when session key is present", async () => {
		const server = createTestServer();
		const mw = urlAction({
			message: "Auth",
			buildUrl: () => "https://example.com",
		});
		server.tool("secret", mw, { input: z.object({}) }, async () => text("ok"));

		// Pre-set session data and authorize
		const session = server._createSessionAPI("default");
		session.set("user", { id: 1 });
		session.authorize("url-action");

		const client = await createConnectedPair(server, async () => ({
			action: "accept",
		}));

		const result = await client.callTool({ name: "secret", arguments: {} });
		expect((result as any).content[0].text).toBe("ok");
	});

	it("returns error when user declines", async () => {
		const server = createTestServer();
		const mw = urlAction({
			message: "Sign in",
			buildUrl: () => "https://example.com",
		});
		server.tool("secret", mw, { input: z.object({}) }, async () => text("ok"));
		server._createSessionAPI("default").authorize("url-action");

		const client = await createConnectedPair(server, async () => ({
			action: "decline",
		}));

		const result = await client.callTool({ name: "secret", arguments: {} });
		expect((result as any).isError).toBe(true);
		expect((result as any).content[0].text).toBe("Action cancelled.");
	});

	it("returns custom decline message", async () => {
		const server = createTestServer();
		const mw = urlAction({
			message: "Sign in",
			buildUrl: () => "https://example.com",
			declineMessage: "Nope.",
		});
		server.tool("secret", mw, { input: z.object({}) }, async () => text("ok"));
		server._createSessionAPI("default").authorize("url-action");

		const client = await createConnectedPair(server, async () => ({
			action: "decline",
		}));

		const result = await client.callTool({ name: "secret", arguments: {} });
		expect((result as any).isError).toBe(true);
		expect((result as any).content[0].text).toBe("Nope.");
	});

	it("passes sessionId and elicitationId to buildUrl", async () => {
		const server = createTestServer();
		let capturedParams: any = null;

		const mw = urlAction({
			message: "Auth",
			buildUrl: (params) => {
				capturedParams = params;
				return `https://example.com?s=${params.sessionId}&e=${params.elicitationId}`;
			},
		});
		server.tool("secret", mw, { input: z.object({}) }, async () => text("ok"));
		server._createSessionAPI("default").authorize("url-action");

		const client = await createConnectedPair(server, async () => ({
			action: "decline",
		}));

		await client.callTool({ name: "secret", arguments: {} });
		expect(capturedParams).not.toBeNull();
		expect(capturedParams.sessionId).toBeDefined();
		expect(capturedParams.elicitationId).toBeDefined();
	});

	it("completes full flow: elicit → callback → next()", async () => {
		const server = createTestServer();
		const mw = urlAction({
			message: "Sign in",
			buildUrl: () => "https://example.com/auth",
			timeout: 5000,
		});
		server.tool("secret", mw, { input: z.object({}) }, async () =>
			text("protected data"),
		);
		server._createSessionAPI("default").authorize("url-action");

		let capturedElicitationId: string | undefined;
		const client = await createConnectedPair(server, async (request: any) => {
			capturedElicitationId = request.params.elicitationId;

			// Simulate external callback completing asynchronously
			setTimeout(() => {
				// External callback sets session data, then completes elicitation
				server.session("default").set("user", { name: "alice" });
				server.completeElicitation(capturedElicitationId!);
			}, 50);

			return { action: "accept" };
		});

		const result = await client.callTool({ name: "secret", arguments: {} });
		expect((result as any).content[0].text).toBe("protected data");
	});

	it("returns error when callback does not set session key", async () => {
		const server = createTestServer();
		const mw = urlAction({
			message: "Sign in",
			buildUrl: () => "https://example.com/auth",
			timeout: 5000,
		});
		server.tool("secret", mw, { input: z.object({}) }, async () => text("ok"));
		server._createSessionAPI("default").authorize("url-action");

		const client = await createConnectedPair(server, async (request: any) => {
			// Complete without setting session key
			setTimeout(() => {
				server.completeElicitation(request.params.elicitationId);
			}, 50);
			return { action: "accept" };
		});

		const result = await client.callTool({ name: "secret", arguments: {} });
		expect((result as any).isError).toBe(true);
		expect((result as any).content[0].text).toBe("Action was not completed.");
	});

	it("uses custom sessionKey", () => {
		const mw = urlAction({
			message: "Auth",
			sessionKey: "token",
			buildUrl: () => "https://example.com",
		});
		// Verify the middleware was created (name is default)
		expect(mw.name).toBe("url-action");
	});
});
