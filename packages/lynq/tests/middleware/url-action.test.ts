import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../../src/core.js";
import { getInternals } from "../../src/internals.js";
import { urlAction } from "../../src/middleware/url-action.js";
import { text } from "../../src/response.js";
import { memoryStore } from "../../src/store.js";

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
		getInternals(server).server.connect(serverTransport),
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
		expect(getInternals(server).isToolVisible("secret", "s1")).toBe(false);
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
		const session = getInternals(server).createSessionAPI("default");
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
		getInternals(server).createSessionAPI("default").authorize("url-action");

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
		getInternals(server).createSessionAPI("default").authorize("url-action");

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
		getInternals(server).createSessionAPI("default").authorize("url-action");

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
		getInternals(server).createSessionAPI("default").authorize("url-action");

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
		getInternals(server).createSessionAPI("default").authorize("url-action");

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

	it("persistent: skips elicitation when userStore has value", async () => {
		const store = memoryStore();
		// Pre-populate userStore with user-scoped data
		await store.set("user:alice:payment", { paid: true });

		const server = createMCPServer({
			name: "test",
			version: "1.0.0",
			store,
		}) as any;

		const mw = urlAction({
			message: "Pay",
			sessionKey: "payment",
			buildUrl: () => "https://example.com/pay",
			persistent: true,
		});
		server.tool("premium", mw, { input: z.object({}) }, async () =>
			text("premium content"),
		);

		// Set user in session + authorize so tool is visible
		const session = getInternals(server).createSessionAPI("default");
		session.set("user", "alice");
		session.authorize("url-action");

		const client = await createConnectedPair(server, async () => ({
			action: "accept",
		}));

		const result = await client.callTool({ name: "premium", arguments: {} });
		expect((result as any).content[0].text).toBe("premium content");
	});

	it("persistent: completes full flow with userStore", async () => {
		const store = memoryStore();
		const server = createMCPServer({
			name: "test",
			version: "1.0.0",
			store,
		}) as any;

		const mw = urlAction({
			message: "Pay",
			sessionKey: "payment",
			buildUrl: () => "https://example.com/pay",
			persistent: true,
			timeout: 5000,
		});
		server.tool("premium", mw, { input: z.object({}) }, async () =>
			text("premium content"),
		);

		// Set user in session + authorize so tool is visible
		const session = getInternals(server).createSessionAPI("default");
		session.set("user", "alice");
		session.authorize("url-action");

		const client = await createConnectedPair(server, async (request: any) => {
			setTimeout(async () => {
				// External callback writes to both session and store
				server.session("default").set("payment", { paid: true });
				await store.set("user:alice:payment", { paid: true });
				server.completeElicitation(request.params.elicitationId);
			}, 50);
			return { action: "accept" };
		});

		const result = await client.callTool({ name: "premium", arguments: {} });
		expect((result as any).content[0].text).toBe("premium content");
	});

	it("persistent: returns error when userStore key not set after callback", async () => {
		const store = memoryStore();
		const server = createMCPServer({
			name: "test",
			version: "1.0.0",
			store,
		}) as any;

		const mw = urlAction({
			message: "Pay",
			sessionKey: "payment",
			buildUrl: () => "https://example.com/pay",
			persistent: true,
			timeout: 5000,
		});
		server.tool("premium", mw, { input: z.object({}) }, async () => text("ok"));

		const session = getInternals(server).createSessionAPI("default");
		session.set("user", "alice");
		session.authorize("url-action");

		const client = await createConnectedPair(server, async (request: any) => {
			// Complete without setting userStore
			setTimeout(() => {
				server.completeElicitation(request.params.elicitationId);
			}, 50);
			return { action: "accept" };
		});

		const result = await client.callTool({ name: "premium", arguments: {} });
		expect((result as any).isError).toBe(true);
		expect((result as any).content[0].text).toBe("Action was not completed.");
	});

	it("skipIf: skips elicitation when skipIf returns true", async () => {
		const server = createTestServer();
		const mw = urlAction({
			message: "Auth",
			buildUrl: () => "https://example.com",
			skipIf: () => true,
		});
		server.tool("secret", mw, { input: z.object({}) }, async () => text("ok"));

		const session = getInternals(server).createSessionAPI("default");
		session.authorize("url-action");

		const client = await createConnectedPair(server, async () => ({
			action: "accept",
		}));

		const result = await client.callTool({ name: "secret", arguments: {} });
		expect((result as any).content[0].text).toBe("ok");
	});

	it("skipIf: does not skip when skipIf returns false", async () => {
		const server = createTestServer();
		const mw = urlAction({
			message: "Auth",
			buildUrl: () => "https://example.com",
			skipIf: () => false,
		});
		server.tool("secret", mw, { input: z.object({}) }, async () => text("ok"));

		const session = getInternals(server).createSessionAPI("default");
		session.authorize("url-action");

		const client = await createConnectedPair(server, async () => ({
			action: "decline",
		}));

		const result = await client.callTool({ name: "secret", arguments: {} });
		expect((result as any).isError).toBe(true);
	});

	it("skipIf: supports async function", async () => {
		const server = createTestServer();
		const mw = urlAction({
			message: "Auth",
			buildUrl: () => "https://example.com",
			skipIf: async () => true,
		});
		server.tool("secret", mw, { input: z.object({}) }, async () => text("ok"));

		const session = getInternals(server).createSessionAPI("default");
		session.authorize("url-action");

		const client = await createConnectedPair(server, async () => ({
			action: "accept",
		}));

		const result = await client.callTool({ name: "secret", arguments: {} });
		expect((result as any).content[0].text).toBe("ok");
	});

	it("skipIf: takes priority over sessionKey check", async () => {
		const server = createTestServer();
		const mw = urlAction({
			message: "Auth",
			buildUrl: () => "https://example.com",
			skipIf: () => true,
			// sessionKey "user" is NOT set, but skipIf returns true
		});
		server.tool("secret", mw, { input: z.object({}) }, async () => text("ok"));

		const session = getInternals(server).createSessionAPI("default");
		// Do NOT set "user" in session
		session.authorize("url-action");

		const client = await createConnectedPair(server, async () => ({
			action: "accept",
		}));

		const result = await client.callTool({ name: "secret", arguments: {} });
		expect((result as any).content[0].text).toBe("ok");
	});

	it("onComplete: called after elicitation completes", async () => {
		const server = createTestServer();
		let completeCalled = false;

		const mw = urlAction({
			message: "Sign in",
			buildUrl: () => "https://example.com/auth",
			timeout: 5000,
			onComplete: () => {
				completeCalled = true;
			},
		});
		server.tool("secret", mw, { input: z.object({}) }, async () =>
			text("protected"),
		);
		getInternals(server).createSessionAPI("default").authorize("url-action");

		const client = await createConnectedPair(server, async (request: any) => {
			setTimeout(() => {
				server.session("default").set("user", { name: "alice" });
				server.completeElicitation(request.params.elicitationId);
			}, 50);
			return { action: "accept" };
		});

		const result = await client.callTool({ name: "secret", arguments: {} });
		expect((result as any).content[0].text).toBe("protected");
		expect(completeCalled).toBe(true);
	});

	it("onComplete: supports async function", async () => {
		const server = createTestServer();
		let completeCalled = false;

		const mw = urlAction({
			message: "Sign in",
			buildUrl: () => "https://example.com/auth",
			timeout: 5000,
			onComplete: async () => {
				await new Promise((r) => setTimeout(r, 10));
				completeCalled = true;
			},
		});
		server.tool("secret", mw, { input: z.object({}) }, async () =>
			text("protected"),
		);
		getInternals(server).createSessionAPI("default").authorize("url-action");

		const client = await createConnectedPair(server, async (request: any) => {
			setTimeout(() => {
				server.session("default").set("user", { name: "alice" });
				server.completeElicitation(request.params.elicitationId);
			}, 50);
			return { action: "accept" };
		});

		const result = await client.callTool({ name: "secret", arguments: {} });
		expect((result as any).content[0].text).toBe("protected");
		expect(completeCalled).toBe(true);
	});

	it("onComplete: not called when skipIf returns true", async () => {
		const server = createTestServer();
		let completeCalled = false;

		const mw = urlAction({
			message: "Auth",
			buildUrl: () => "https://example.com",
			skipIf: () => true,
			onComplete: () => {
				completeCalled = true;
			},
		});
		server.tool("secret", mw, { input: z.object({}) }, async () => text("ok"));

		const session = getInternals(server).createSessionAPI("default");
		session.authorize("url-action");

		const client = await createConnectedPair(server, async () => ({
			action: "accept",
		}));

		await client.callTool({ name: "secret", arguments: {} });
		expect(completeCalled).toBe(false);
	});
});
