import { createMCPServer, text } from "@lynq/lynq";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { crypto, handleCallback } from "../src/index.js";

function createTestServer() {
	return createMCPServer({ name: "test", version: "1.0.0" }) as any;
}

const BASE_OPTIONS = {
	recipient: "0x1234567890abcdef1234567890abcdef12345678",
	amount: 0.01,
	baseUrl: "http://localhost:3000",
};

describe("crypto middleware", () => {
	it("has correct default name", () => {
		const mw = crypto(BASE_OPTIONS);
		expect(mw.name).toBe("crypto");
	});

	it("uses custom name", () => {
		const mw = crypto({ ...BASE_OPTIONS, name: "my-crypto" });
		expect(mw.name).toBe("my-crypto");
	});

	it("hides tools on registration", () => {
		const server = createTestServer();
		server.tool(
			"premium",
			crypto(BASE_OPTIONS),
			{ input: z.object({}) },
			async () => text("ok"),
		);
		expect(server._isToolVisible("premium", "s1")).toBe(false);
	});

	it("shows tools after authorization", () => {
		const server = createTestServer();
		server.tool(
			"premium",
			crypto(BASE_OPTIONS),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		const session = server._createSessionAPI("s1");
		session.authorize("crypto");
		expect(server._isToolVisible("premium", "s1")).toBe(true);
	});

	it("defaults to USDC token", () => {
		const mw = crypto(BASE_OPTIONS);
		expect(mw.name).toBe("crypto");
		expect(mw.onRegister).toBeDefined();
	});

	it("accepts custom token", () => {
		const mw = crypto({ ...BASE_OPTIONS, token: "ETH" });
		expect(mw.name).toBe("crypto");
	});

	it("clears session key in onResult when once is false (default)", () => {
		const mw = crypto(BASE_OPTIONS);
		expect(mw.onResult).toBeDefined();

		const mockSession = {
			set: vi.fn(),
			get: vi.fn(),
			authorize: vi.fn(),
			revoke: vi.fn(),
			enableTools: vi.fn(),
			disableTools: vi.fn(),
			enableResources: vi.fn(),
			disableResources: vi.fn(),
		};
		const ctx = { session: mockSession } as any;
		const result = text("ok");

		mw.onResult!(result, ctx);
		expect(mockSession.set).toHaveBeenCalledWith("payment", undefined);
	});

	it("does not define onResult when once is true", () => {
		const mw = crypto({ ...BASE_OPTIONS, once: true });
		expect(mw.onResult).toBeUndefined();
	});
});

describe("handleCallback (crypto)", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		globalThis.fetch = vi.fn();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("verifies transaction and stores payment data", async () => {
		const server = createTestServer();
		server._createSessionAPI("session-1");
		const completeSpy = vi.spyOn(server, "completeElicitation");

		(globalThis.fetch as any).mockResolvedValueOnce({
			json: async () => ({
				result: { status: "0x1" },
			}),
		});

		const result = await handleCallback(
			server,
			{ state: "session-1:elicit-1", txHash: "0xabc123" },
			{
				recipient: BASE_OPTIONS.recipient,
				amount: BASE_OPTIONS.amount,
			},
		);

		expect(result.success).toBe(true);
		const session = server._createSessionAPI("session-1");
		const paymentData = session.get("payment") as any;
		expect(paymentData.provider).toBe("crypto");
		expect(paymentData.txHash).toBe("0xabc123");
		expect(paymentData.amount).toBe(0.01);
		expect(completeSpy).toHaveBeenCalledWith("elicit-1");
	});

	it("returns error on invalid state", async () => {
		const server = createTestServer();

		const result = await handleCallback(
			server,
			{ state: "invalid", txHash: "0xabc" },
			{ recipient: BASE_OPTIONS.recipient, amount: 0.01 },
		);

		expect(result.success).toBe(false);
		expect(result.error).toBe("Invalid state parameter");
	});

	it("returns error when transaction verification fails", async () => {
		const server = createTestServer();
		server._createSessionAPI("session-1");

		(globalThis.fetch as any).mockResolvedValueOnce({
			json: async () => ({
				result: { status: "0x0" },
			}),
		});

		const result = await handleCallback(
			server,
			{ state: "session-1:elicit-1", txHash: "0xfailed" },
			{ recipient: BASE_OPTIONS.recipient, amount: 0.01 },
		);

		expect(result.success).toBe(false);
		expect(result.error).toBe("Transaction verification failed");
	});

	it("returns error when RPC call fails", async () => {
		const server = createTestServer();
		server._createSessionAPI("session-1");

		(globalThis.fetch as any).mockRejectedValueOnce(new Error("Network error"));

		const result = await handleCallback(
			server,
			{ state: "session-1:elicit-1", txHash: "0xabc" },
			{ recipient: BASE_OPTIONS.recipient, amount: 0.01 },
		);

		expect(result.success).toBe(false);
		expect(result.error).toBe("Transaction verification failed");
	});

	it("uses custom RPC URL", async () => {
		const server = createTestServer();
		server._createSessionAPI("session-1");

		(globalThis.fetch as any).mockResolvedValueOnce({
			json: async () => ({
				result: { status: "0x1" },
			}),
		});

		await handleCallback(
			server,
			{ state: "session-1:elicit-1", txHash: "0xabc" },
			{
				recipient: BASE_OPTIONS.recipient,
				amount: 0.01,
				rpcUrl: "https://sepolia.base.org",
			},
		);

		const fetchCalls = (globalThis.fetch as any).mock.calls;
		expect(fetchCalls[0][0]).toBe("https://sepolia.base.org");
	});
});
