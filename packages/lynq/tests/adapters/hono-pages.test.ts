import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountLynq } from "../../src/adapters/hono.js";
import { createMCPServer } from "../../src/core.js";
import { text } from "../../src/response.js";

function createApp(options?: Parameters<typeof mountLynq>[2]) {
	const server = createMCPServer({ name: "test", version: "1.0.0" }) as any;
	server.tool("ping", {}, async () => text("pong"));
	// Create a session so handleCallback can find it
	server._createSessionAPI("session-1");
	const app = new Hono();
	mountLynq(app, server, options);
	return { app, server };
}

describe("hono pages", () => {
	describe("success pages", () => {
		it("registers auth success page when any provider is configured", async () => {
			const { app } = createApp({ pages: { crypto: true } });
			const res = await app.request("/lynq/auth/success", {
				headers: { Host: "localhost" },
			});
			expect(res.status).toBe(200);
			const html = await res.text();
			expect(html).toContain("Authentication complete");
		});

		it("registers payment success page when any provider is configured", async () => {
			const { app } = createApp({ pages: { crypto: true } });
			const res = await app.request("/lynq/payment/success", {
				headers: { Host: "localhost" },
			});
			expect(res.status).toBe(200);
			const html = await res.text();
			expect(html).toContain("Payment complete");
		});
	});

	describe("custom pagesPrefix", () => {
		it("registers pages under custom prefix", async () => {
			const { app } = createApp({
				pages: { crypto: true },
				pagesPrefix: "/my-app",
			});
			const res = await app.request("/my-app/auth/success", {
				headers: { Host: "localhost" },
			});
			expect(res.status).toBe(200);
			const html = await res.text();
			expect(html).toContain("Authentication complete");
		});
	});

	describe("unspecified providers", () => {
		it("does not register github routes when not in pages config", async () => {
			const { app } = createApp({ pages: { crypto: true } });
			const res = await app.request(
				"/lynq/auth/github/callback?code=x&state=y",
				{ headers: { Host: "localhost" } },
			);
			expect(res.status).toBe(404);
		});

		it("does not register stripe routes when not in pages config", async () => {
			const { app } = createApp({ pages: { crypto: true } });
			const res = await app.request(
				"/lynq/payment/stripe/callback?session_id=x&state=y",
				{ headers: { Host: "localhost" } },
			);
			expect(res.status).toBe(404);
		});
	});

	describe("string redirect config", () => {
		it("redirects github callback to custom URL", async () => {
			const { app } = createApp({
				pages: { github: "https://my-app.com/auth/done" },
			});
			const res = await app.request(
				"/lynq/auth/github/callback?code=abc&state=xyz",
				{ headers: { Host: "localhost" }, redirect: "manual" },
			);
			expect(res.status).toBe(302);
			const location = res.headers.get("Location");
			expect(location).toContain("https://my-app.com/auth/done");
			expect(location).toContain("code=abc");
			expect(location).toContain("state=xyz");
		});

		it("redirects crypto page to custom URL", async () => {
			const { app } = createApp({
				pages: { crypto: "/custom-pay.html" },
			});
			const res = await app.request(
				"/lynq/payment/crypto?recipient=0x123&amount=1&state=s:e",
				{ headers: { Host: "localhost" }, redirect: "manual" },
			);
			expect(res.status).toBe(302);
		});
	});

	describe("github pages", () => {
		const originalFetch = globalThis.fetch;

		beforeEach(() => {
			globalThis.fetch = vi.fn();
		});

		afterEach(() => {
			globalThis.fetch = originalFetch;
		});

		it("returns error page when config is true", async () => {
			const { app } = createApp({ pages: { github: true } });
			const res = await app.request(
				"/lynq/auth/github/callback?code=abc&state=session-1:elicit-1",
				{ headers: { Host: "localhost" } },
			);
			expect(res.status).toBe(500);
			const html = await res.text();
			expect(html).toContain("clientId");
		});

		it("handles successful callback with config object", async () => {
			const { app } = createApp({
				pages: {
					github: {
						clientId: "gh-id",
						clientSecret: "gh-secret",
					},
				},
			});

			(globalThis.fetch as any)
				.mockResolvedValueOnce({
					json: async () => ({ access_token: "gho_abc123" }),
				})
				.mockResolvedValueOnce({
					json: async () => ({
						id: 42,
						login: "alice",
						name: "Alice",
					}),
				});

			const res = await app.request(
				"/lynq/auth/github/callback?code=auth-code&state=session-1:elicit-1",
				{ headers: { Host: "localhost" }, redirect: "manual" },
			);
			expect(res.status).toBe(302);
			expect(res.headers.get("Location")).toBe("/lynq/auth/success");
		});

		it("returns error page on missing params", async () => {
			const { app } = createApp({
				pages: {
					github: {
						clientId: "gh-id",
						clientSecret: "gh-secret",
					},
				},
			});

			const res = await app.request("/lynq/auth/github/callback", {
				headers: { Host: "localhost" },
			});
			expect(res.status).toBe(400);
			const html = await res.text();
			expect(html).toContain("Missing code or state");
		});

		it("returns error page when token exchange fails", async () => {
			const { app } = createApp({
				pages: {
					github: {
						clientId: "gh-id",
						clientSecret: "gh-secret",
					},
				},
			});

			(globalThis.fetch as any).mockResolvedValueOnce({
				json: async () => ({
					error: "bad_verification_code",
					error_description: "Code expired",
				}),
			});

			const res = await app.request(
				"/lynq/auth/github/callback?code=bad&state=session-1:elicit-1",
				{ headers: { Host: "localhost" } },
			);
			expect(res.status).toBe(500);
			const html = await res.text();
			expect(html).toContain("Code expired");
		});
	});

	describe("stripe pages", () => {
		it("returns error page when config is true", async () => {
			const { app } = createApp({ pages: { stripe: true } });
			const res = await app.request(
				"/lynq/payment/stripe/callback?session_id=cs_123&state=session-1:elicit-1",
				{ headers: { Host: "localhost" } },
			);
			expect(res.status).toBe(500);
			const html = await res.text();
			expect(html).toContain("secretKey");
		});

		it("shows cancelled page", async () => {
			const { app } = createApp({
				pages: { stripe: { secretKey: "sk_test_123" } },
			});
			const res = await app.request(
				"/lynq/payment/stripe/callback?cancelled=true&state=session-1:elicit-1",
				{ headers: { Host: "localhost" } },
			);
			expect(res.status).toBe(200);
			const html = await res.text();
			expect(html).toContain("cancelled");
		});
	});

	describe("crypto pages", () => {
		it("renders payment page with query params", async () => {
			const { app } = createApp({ pages: { crypto: true } });
			const res = await app.request(
				"/lynq/payment/crypto?recipient=0xabc&amount=0.01&token=ETH&network=base&state=session-1:elicit-1",
				{ headers: { Host: "localhost" } },
			);
			expect(res.status).toBe(200);
			const html = await res.text();
			expect(html).toContain("0xabc");
			expect(html).toContain("0.01");
			expect(html).toContain("ETH");
		});

		it("returns error on missing payment params", async () => {
			const { app } = createApp({ pages: { crypto: true } });
			const res = await app.request("/lynq/payment/crypto", {
				headers: { Host: "localhost" },
			});
			expect(res.status).toBe(400);
			const html = await res.text();
			expect(html).toContain("Missing required payment parameters");
		});

		it("handles crypto POST callback", async () => {
			const originalFetch = globalThis.fetch;
			globalThis.fetch = vi.fn().mockResolvedValueOnce({
				json: async () => ({ result: { status: "0x1" } }),
			});

			try {
				const { app } = createApp({ pages: { crypto: true } });
				const res = await app.request("/lynq/payment/crypto/callback", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Host: "localhost",
					},
					body: JSON.stringify({
						txHash: "0xtx123",
						state: "session-1:elicit-1",
						recipient: "0xabc",
						amount: "0.01",
					}),
				});
				expect(res.status).toBe(200);
				const data = await res.json();
				expect(data.success).toBe(true);
			} finally {
				globalThis.fetch = originalFetch;
			}
		});
	});
});
