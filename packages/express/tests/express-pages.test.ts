import { createMCPServer, text } from "@lynq/lynq";
import { signState } from "@lynq/lynq/helpers";
import { getInternals } from "@lynq/lynq/test";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountLynq } from "../src/index.js";

const realFetch = globalThis.fetch;

function createApp(options?: Parameters<typeof mountLynq>[2]) {
	const server = createMCPServer({ name: "test", version: "1.0.0" });
	server.tool("ping", {}, async () => text("pong"));
	getInternals(server).createSessionAPI("session-1");
	const app = express();
	app.use(express.json());
	mountLynq(app, server, options);
	return { app, server };
}

async function request(
	app: express.Express,
	path: string,
	options?: {
		method?: string;
		host?: string;
		body?: unknown;
		redirect?: "manual" | "follow";
	},
): Promise<{ status: number; body: string; headers: Headers }> {
	return new Promise((resolve, reject) => {
		const srv = app.listen(0, () => {
			const addr = srv.address();
			if (!addr || typeof addr === "string") {
				srv.close();
				return reject(new Error("Failed to get port"));
			}
			const url = `http://127.0.0.1:${addr.port}${path}`;
			const init: RequestInit = {
				method: options?.method ?? "GET",
				headers: {
					Host: options?.host ?? "localhost",
					"Content-Type": "application/json",
				},
				redirect: options?.redirect ?? "manual",
			};
			if (options?.body) {
				init.body = JSON.stringify(options.body);
			}
			realFetch(url, init)
				.then(async (res) => {
					const body = await res.text().catch(() => "");
					srv.close();
					resolve({ status: res.status, body, headers: res.headers });
				})
				.catch((err) => {
					srv.close();
					reject(err);
				});
		});
	});
}

describe("express pages", () => {
	describe("success pages", () => {
		it("registers auth success page", async () => {
			const { app } = createApp({ pages: { crypto: true } });
			const res = await request(app, "/lynq/auth/success");
			expect(res.status).toBe(200);
			expect(res.body).toContain("Authentication complete");
		});

		it("registers payment success page", async () => {
			const { app } = createApp({ pages: { crypto: true } });
			const res = await request(app, "/lynq/payment/success");
			expect(res.status).toBe(200);
			expect(res.body).toContain("Payment complete");
		});
	});

	describe("custom pagesPrefix", () => {
		it("registers pages under custom prefix", async () => {
			const { app } = createApp({
				pages: { crypto: true },
				pagesPrefix: "/my-app",
			});
			const res = await request(app, "/my-app/auth/success");
			expect(res.status).toBe(200);
			expect(res.body).toContain("Authentication complete");
		});
	});

	describe("unspecified providers", () => {
		it("does not register github routes when not in pages config", async () => {
			const { app } = createApp({ pages: { crypto: true } });
			const res = await request(
				app,
				"/lynq/auth/github/callback?code=x&state=y",
			);
			expect(res.status).toBe(404);
		});
	});

	describe("string redirect config", () => {
		it("redirects github callback to custom URL", async () => {
			const { app } = createApp({
				pages: { github: "https://my-app.com/auth/done" },
			});
			const res = await request(
				app,
				"/lynq/auth/github/callback?code=abc&state=xyz",
				{ redirect: "manual" },
			);
			expect(res.status).toBe(302);
			expect(res.headers.get("Location")).toContain(
				"https://my-app.com/auth/done",
			);
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
			const res = await request(
				app,
				"/lynq/auth/github/callback?code=abc&state=session-1:elicit-1",
			);
			expect(res.status).toBe(500);
			expect(res.body).toContain("clientId");
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

			const state = signState("session-1", "elicit-1", "gh-secret");
			const res = await request(
				app,
				`/lynq/auth/github/callback?code=auth-code&state=${state}`,
				{ redirect: "manual" },
			);
			expect(res.status).toBe(302);
			expect(res.headers.get("Location")).toBe("/lynq/auth/success");
		});
	});

	describe("crypto pages", () => {
		it("renders payment page with query params", async () => {
			const { app } = createApp({ pages: { crypto: true } });
			const res = await request(
				app,
				"/lynq/payment/crypto?recipient=0xabc&amount=0.01&token=ETH&network=base&state=session-1:elicit-1",
			);
			expect(res.status).toBe(200);
			expect(res.body).toContain("0xabc");
			expect(res.body).toContain("0.01");
		});

		it("handles crypto POST callback", async () => {
			const originalFetch = globalThis.fetch;
			globalThis.fetch = vi.fn().mockResolvedValueOnce({
				json: async () => ({ result: { status: "0x1" } }),
			});

			try {
				const { app } = createApp({ pages: { crypto: true } });
				const res = await request(app, "/lynq/payment/crypto/callback", {
					method: "POST",
					body: {
						txHash: "0xtx123",
						state: "session-1:elicit-1",
						recipient: "0xabc",
						amount: "0.01",
					},
				});
				expect(res.status).toBe(200);
				const data = JSON.parse(res.body);
				expect(data.success).toBe(true);
			} finally {
				globalThis.fetch = originalFetch;
			}
		});
	});
});
