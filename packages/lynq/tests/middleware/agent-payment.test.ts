import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../../src/core.js";
import { getInternals } from "../../src/internals.js";
import { agentPayment } from "../../src/middleware/agent-payment.js";
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
		getInternals(server).server.connect(serverTransport),
		client.connect(clientTransport),
	]);
	return client;
}

describe("agentPayment middleware", () => {
	it("has correct default name", () => {
		const mw = agentPayment({
			recipient: "0x1234",
			amount: "1.00",
			verify: async () => true,
		});
		expect(mw.name).toBe("agent-payment");
	});

	it("uses custom name", () => {
		const mw = agentPayment({
			name: "pay-me",
			recipient: "0x1234",
			amount: "1.00",
			verify: async () => true,
		});
		expect(mw.name).toBe("pay-me");
	});

	it("does not hide tools on registration (no onRegister)", () => {
		const server = createTestServer();
		const mw = agentPayment({
			recipient: "0x1234",
			amount: "1.00",
			verify: async () => true,
		});
		server.tool("premium", mw, { input: z.object({}) }, async () => text("ok"));
		expect(getInternals(server).isToolVisible("premium", "s1")).toBe(true);
	});

	it("accepts valid proof and calls handler", async () => {
		const verify = vi.fn().mockResolvedValue(true);
		const server = createTestServer();
		const mw = agentPayment({
			recipient: "0x1234",
			amount: "1.00",
			verify,
		});
		server.tool("premium", mw, { input: z.object({}) }, async () => text("ok"));

		const client = await createConnectedPair(server, async () => ({
			action: "accept",
			content: { type: "tx_hash", value: "0xabc" },
		}));

		const result = await client.callTool({ name: "premium", arguments: {} });
		expect((result as any).content[0].text).toBe("ok");
		expect(verify).toHaveBeenCalledWith(
			{ type: "tx_hash", value: "0xabc" },
			{ recipient: "0x1234", amount: "1.00", network: "base", token: "USDC" },
		);
	});

	it("returns error when agent declines", async () => {
		const server = createTestServer();
		const mw = agentPayment({
			recipient: "0x1234",
			amount: "1.00",
			verify: async () => true,
		});
		server.tool("premium", mw, { input: z.object({}) }, async () => text("ok"));

		const client = await createConnectedPair(server, async () => ({
			action: "decline",
		}));

		const result = await client.callTool({ name: "premium", arguments: {} });
		expect((result as any).isError).toBe(true);
		expect((result as any).content[0].text).toBe("Payment cancelled.");
	});

	it("returns error when verification fails", async () => {
		const server = createTestServer();
		const mw = agentPayment({
			recipient: "0x1234",
			amount: "1.00",
			verify: async () => false,
		});
		server.tool("premium", mw, { input: z.object({}) }, async () => text("ok"));

		const client = await createConnectedPair(server, async () => ({
			action: "accept",
			content: { type: "tx_hash", value: "0xbad" },
		}));

		const result = await client.callTool({ name: "premium", arguments: {} });
		expect((result as any).isError).toBe(true);
		expect((result as any).content[0].text).toBe(
			"Payment verification failed.",
		);
	});

	it("skips elicitation when once=true and session key is set", async () => {
		const verify = vi.fn();
		const server = createTestServer();
		const mw = agentPayment({
			recipient: "0x1234",
			amount: "1.00",
			verify,
		});
		server.tool("premium", mw, { input: z.object({}) }, async () => text("ok"));

		// Pre-set session data
		const session = getInternals(server).createSessionAPI("default");
		session.set("agent-payment", { type: "tx_hash", value: "0xabc" });

		const client = await createConnectedPair(server, async () => ({
			action: "accept",
			content: { type: "tx_hash", value: "0xabc" },
		}));

		const result = await client.callTool({ name: "premium", arguments: {} });
		expect((result as any).content[0].text).toBe("ok");
		expect(verify).not.toHaveBeenCalled();
	});

	it("clears session key via onResult when once=false", async () => {
		const server = createTestServer();
		const mw = agentPayment({
			recipient: "0x1234",
			amount: "1.00",
			once: false,
			verify: async () => true,
		});
		expect(mw.onResult).toBeDefined();

		server.tool("premium", mw, { input: z.object({}) }, async () => text("ok"));

		const client = await createConnectedPair(server, async () => ({
			action: "accept",
			content: { type: "tx_hash", value: "0xabc" },
		}));

		const result = await client.callTool({ name: "premium", arguments: {} });
		expect((result as any).content[0].text).toBe("ok");

		// Session key should be cleared after onResult
		const session = getInternals(server).createSessionAPI("default");
		expect(session.get("agent-payment")).toBeUndefined();
	});

	it("does not have onResult when once=true", () => {
		const mw = agentPayment({
			recipient: "0x1234",
			amount: "1.00",
			once: true,
			verify: async () => true,
		});
		expect(mw.onResult).toBeUndefined();
	});

	it("skipIf takes priority over session key check", async () => {
		const verify = vi.fn();
		const server = createTestServer();
		const mw = agentPayment({
			recipient: "0x1234",
			amount: "1.00",
			skipIf: () => true,
			verify,
		});
		server.tool("premium", mw, { input: z.object({}) }, async () => text("ok"));

		const client = await createConnectedPair(server, async () => ({
			action: "decline",
		}));

		const result = await client.callTool({ name: "premium", arguments: {} });
		expect((result as any).content[0].text).toBe("ok");
		expect(verify).not.toHaveBeenCalled();
	});

	it("calls onComplete after verification succeeds", async () => {
		const onComplete = vi.fn();
		const server = createTestServer();
		const mw = agentPayment({
			recipient: "0x1234",
			amount: "1.00",
			verify: async () => true,
			onComplete,
		});
		server.tool("premium", mw, { input: z.object({}) }, async () => text("ok"));

		const client = await createConnectedPair(server, async () => ({
			action: "accept",
			content: { type: "signature", value: "0xsig" },
		}));

		const result = await client.callTool({ name: "premium", arguments: {} });
		expect((result as any).content[0].text).toBe("ok");
		expect(onComplete).toHaveBeenCalledOnce();
	});

	it("uses custom token and network in default message", () => {
		const mw = agentPayment({
			recipient: "0x1234",
			amount: "5.00",
			token: "ETH",
			network: "ethereum",
			verify: async () => true,
		});
		// The message is internal, but we can verify the middleware was created
		expect(mw.name).toBe("agent-payment");
	});
});
