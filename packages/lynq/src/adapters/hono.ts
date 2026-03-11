import type { Context, Hono } from "hono";
import type { MCPServer } from "../types.js";
import { type PagesConfig, successPage } from "./pages.js";
import { LOCALHOST_HOSTS, validateHost } from "./shared.js";

export type { PagesConfig } from "./pages.js";

export interface MountOptions {
	/** Route path. Default: "/mcp" */
	path?: string;
	/** Allowed hostnames for DNS rebinding protection. Default: localhost variants. */
	allowedHosts?: string[];
	/** Enable default pages for specified auth/payment providers. */
	pages?: PagesConfig;
	/** URL prefix for pages routes. Default: "/lynq" */
	pagesPrefix?: string;
}

export function mountLynq(
	app: Hono,
	server: MCPServer,
	options?: MountOptions,
): void {
	const path = options?.path ?? "/mcp";
	const handler = server.http();
	const allowed = options?.allowedHosts ?? [...LOCALHOST_HOSTS];

	app.use(path, async (c: Context, next) => {
		if (!validateHost(c.req.header("host") ?? null, allowed)) {
			return c.json(
				{
					jsonrpc: "2.0",
					error: { code: -32000, message: "Forbidden" },
					id: null,
				},
				403,
			);
		}
		return next();
	});

	app.all(path, (c: Context) => handler(c.req.raw));

	if (options?.pages) {
		registerPages(app, server, options);
	}
}

function registerPages(
	app: Hono,
	server: MCPServer,
	options: MountOptions,
): void {
	const prefix = options.pagesPrefix ?? "/lynq";
	const pages = options.pages as PagesConfig;

	if (pages.github && typeof pages.github !== "string") {
		app.get(`${prefix}/auth/github/callback`, async (c: Context) => {
			const { handleGitHubPage } = await import("./pages.js");
			const result = await handleGitHubPage(
				server,
				{
					code: c.req.query("code"),
					state: c.req.query("state"),
				},
				pages.github as Exclude<typeof pages.github, string | undefined>,
				prefix,
			);
			if (result.redirect) return c.redirect(result.redirect);
			return c.html(result.html ?? "", result.status as 200);
		});
	} else if (typeof pages.github === "string") {
		app.get(`${prefix}/auth/github/callback`, (c: Context) => {
			const url = new URL(pages.github as string, c.req.url);
			const query = c.req.query();
			for (const [k, v] of Object.entries(query)) {
				url.searchParams.set(k, v);
			}
			return c.redirect(url.toString());
		});
	}

	if (pages.google && typeof pages.google !== "string") {
		app.get(`${prefix}/auth/google/callback`, async (c: Context) => {
			const { handleGooglePage } = await import("./pages.js");
			const reqUrl = new URL(c.req.url);
			const redirectUri = `${reqUrl.origin}${prefix}/auth/google/callback`;
			const result = await handleGooglePage(
				server,
				{
					code: c.req.query("code"),
					state: c.req.query("state"),
				},
				pages.google as Exclude<typeof pages.google, string | undefined>,
				prefix,
				redirectUri,
			);
			if (result.redirect) return c.redirect(result.redirect);
			return c.html(result.html ?? "", result.status as 200);
		});
	} else if (typeof pages.google === "string") {
		app.get(`${prefix}/auth/google/callback`, (c: Context) => {
			const url = new URL(pages.google as string, c.req.url);
			const query = c.req.query();
			for (const [k, v] of Object.entries(query)) {
				url.searchParams.set(k, v);
			}
			return c.redirect(url.toString());
		});
	}

	if (pages.stripe && typeof pages.stripe !== "string") {
		app.get(`${prefix}/payment/stripe/callback`, async (c: Context) => {
			const { handleStripePage } = await import("./pages.js");
			const result = await handleStripePage(
				server,
				{
					session_id: c.req.query("session_id"),
					cancelled: c.req.query("cancelled"),
					state: c.req.query("state"),
				},
				pages.stripe as Exclude<typeof pages.stripe, string | undefined>,
				prefix,
			);
			if (result.redirect) return c.redirect(result.redirect);
			return c.html(result.html ?? "", result.status as 200);
		});
	} else if (typeof pages.stripe === "string") {
		app.get(`${prefix}/payment/stripe/callback`, (c: Context) => {
			const url = new URL(pages.stripe as string, c.req.url);
			const query = c.req.query();
			for (const [k, v] of Object.entries(query)) {
				url.searchParams.set(k, v);
			}
			return c.redirect(url.toString());
		});
	}

	if (pages.crypto && typeof pages.crypto !== "string") {
		const cryptoConfig = pages.crypto;
		app.get(`${prefix}/payment/crypto`, async (c: Context) => {
			const { handleCryptoGet } = await import("./pages.js");
			const callbackUrl = `${new URL(c.req.url).origin}${prefix}/payment/crypto/callback`;
			const result = handleCryptoGet(
				{
					recipient: c.req.query("recipient"),
					amount: c.req.query("amount"),
					token: c.req.query("token"),
					network: c.req.query("network"),
					state: c.req.query("state"),
				},
				callbackUrl,
			);
			return c.html(result.html ?? "", result.status as 200);
		});

		app.post(`${prefix}/payment/crypto/callback`, async (c: Context) => {
			const { handleCryptoPost } = await import("./pages.js");
			const body = await c.req.json();
			const result = await handleCryptoPost(server, body, cryptoConfig);
			return c.json(result.json, result.status as 200);
		});
	} else if (typeof pages.crypto === "string") {
		app.get(`${prefix}/payment/crypto`, (c: Context) => {
			const url = new URL(pages.crypto as string, c.req.url);
			const query = c.req.query();
			for (const [k, v] of Object.entries(query)) {
				url.searchParams.set(k, v);
			}
			return c.redirect(url.toString());
		});
	}

	// Shared success pages (registered when any provider is configured)
	app.get(`${prefix}/auth/success`, (c: Context) =>
		c.html(successPage("Authentication")),
	);
	app.get(`${prefix}/payment/success`, (c: Context) =>
		c.html(successPage("Payment")),
	);
}
