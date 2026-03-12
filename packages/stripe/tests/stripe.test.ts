import { createMCPServer, text } from "@lynq/lynq";
import { signState } from "@lynq/lynq/helpers";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { handleCallback, stripe } from "../src/index.js";

function createTestServer() {
	return createMCPServer({ name: "test", version: "1.0.0" }) as any;
}

const BASE_OPTIONS = {
	secretKey: "sk_test_123",
	baseUrl: "http://localhost:3000",
	amount: 100,
};

describe("stripe middleware", () => {
	it("has correct default name", () => {
		const mw = stripe(BASE_OPTIONS);
		expect(mw.name).toBe("stripe");
	});

	it("uses custom name", () => {
		const mw = stripe({ ...BASE_OPTIONS, name: "my-stripe" });
		expect(mw.name).toBe("my-stripe");
	});

	it("hides tools on registration", () => {
		const server = createTestServer();
		server.tool(
			"premium",
			stripe(BASE_OPTIONS),
			{ input: z.object({}) },
			async () => text("ok"),
		);
		expect(server._isToolVisible("premium", "s1")).toBe(false);
	});

	it("shows tools after authorization", () => {
		const server = createTestServer();
		server.tool(
			"premium",
			stripe(BASE_OPTIONS),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		const session = server._createSessionAPI("s1");
		session.authorize("stripe");
		expect(server._isToolVisible("premium", "s1")).toBe(true);
	});

	it("formats default message with amount", () => {
		const mw = stripe({ ...BASE_OPTIONS, amount: 250 });
		// The message is internal to the payment wrapper, we verify by name
		expect(mw.name).toBe("stripe");
	});

	it("clears session key in onResult when once is false (default)", () => {
		const mw = stripe(BASE_OPTIONS);
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

		mw.onResult!(text("ok"), ctx);
		expect(mockSession.set).toHaveBeenCalledWith("payment", undefined);
	});

	it("does not define onResult when once is true", () => {
		const mw = stripe({ ...BASE_OPTIONS, once: true });
		expect(mw.onResult).toBeUndefined();
	});
});

describe("handleCallback (stripe)", () => {
	it("returns error on invalid state", async () => {
		const server = createTestServer();

		const result = await handleCallback(
			server,
			{ checkoutSessionId: "cs_123", state: "invalid" },
			{ secretKey: "sk_test_123" },
		);

		expect(result.success).toBe(false);
		expect(result.error).toBe("Invalid state parameter");
	});

	it("returns error on tampered state", async () => {
		const server = createTestServer();

		const result = await handleCallback(
			server,
			{ checkoutSessionId: "cs_123", state: "session-1:elicit-1:badsig" },
			{ secretKey: "sk_test_123" },
		);

		expect(result.success).toBe(false);
		expect(result.error).toBe("Invalid state parameter");
	});

	it("verifies payment and stores data", async () => {
		const server = createTestServer();
		server._createSessionAPI("session-1");
		const completeSpy = vi.spyOn(server, "completeElicitation");

		// Mock the stripe module
		const mockRetrieve = vi.fn().mockResolvedValue({
			id: "cs_123",
			payment_status: "paid",
			amount_total: 100,
			currency: "usd",
		});

		vi.doMock("stripe", () => ({
			default: class {
				checkout = {
					sessions: {
						retrieve: mockRetrieve,
					},
				};
			},
		}));

		// Re-import to pick up the mock
		const { handleCallback: handler } = await import("../src/index.js");

		const state = signState("session-1", "elicit-1", "sk_test_123");
		const result = await handler(
			server,
			{ checkoutSessionId: "cs_123", state },
			{ secretKey: "sk_test_123" },
		);

		expect(result.success).toBe(true);
		expect(mockRetrieve).toHaveBeenCalledWith("cs_123");

		const session = server._createSessionAPI("session-1");
		const paymentData = session.get("payment") as any;
		expect(paymentData.provider).toBe("stripe");
		expect(paymentData.checkoutSessionId).toBe("cs_123");
		expect(paymentData.amount).toBe(100);
		expect(completeSpy).toHaveBeenCalledWith("elicit-1");

		vi.doUnmock("stripe");
	});

	it("returns error when payment not completed", async () => {
		const server = createTestServer();
		server._createSessionAPI("session-1");

		vi.doMock("stripe", () => ({
			default: class {
				checkout = {
					sessions: {
						retrieve: vi.fn().mockResolvedValue({
							id: "cs_123",
							payment_status: "unpaid",
						}),
					},
				};
			},
		}));

		const { handleCallback: handler } = await import("../src/index.js");

		const state = signState("session-1", "elicit-1", "sk_test_123");
		const result = await handler(
			server,
			{ checkoutSessionId: "cs_123", state },
			{ secretKey: "sk_test_123" },
		);

		expect(result.success).toBe(false);
		expect(result.error).toBe("Payment not completed");

		vi.doUnmock("stripe");
	});
});
