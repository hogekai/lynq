import type { MCPServer } from "@lynq/lynq";
import { LOCALHOST_HOSTS, validateHost } from "@lynq/lynq/helpers";
import {
	type CryptoPagesConfig,
	type GitHubPagesConfig,
	type GooglePagesConfig,
	type PageResult,
	type PagesConfig,
	type StripePagesConfig,
	cryptoPaymentPage,
	errorPage,
	successPage,
} from "@lynq/lynq/pages";
import type { Context, Hono } from "hono";

export type { PagesConfig } from "@lynq/lynq/pages";

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

// ── Page Handlers ─────────────────────────────────────────────────────

async function handleGitHubPage(
	server: MCPServer,
	query: { code: string | undefined; state: string | undefined },
	config: true | GitHubPagesConfig,
	prefix: string,
): Promise<PageResult> {
	if (config === true) {
		return {
			status: 500,
			html: errorPage(
				"GitHub pages require { clientId, clientSecret } configuration",
			),
		};
	}

	if (!query.code || !query.state) {
		return {
			status: 400,
			html: errorPage("Missing code or state parameter"),
		};
	}

	try {
		const { handleCallback } = await import("@lynq/github");
		const opts: Parameters<typeof handleCallback>[2] = {
			clientId: config.clientId,
			clientSecret: config.clientSecret,
		};
		if (config.sessionKey) opts.sessionKey = config.sessionKey;
		const result = await handleCallback(
			server,
			{ code: query.code, state: query.state },
			opts,
		);

		if (!result.success) {
			return {
				status: 500,
				html: errorPage(result.error ?? "Authentication failed"),
			};
		}

		return { status: 302, redirect: `${prefix}/auth/success` };
	} catch (err) {
		return {
			status: 500,
			html: errorPage(err instanceof Error ? err.message : String(err)),
		};
	}
}

async function handleGooglePage(
	server: MCPServer,
	query: { code: string | undefined; state: string | undefined },
	config: true | GooglePagesConfig,
	prefix: string,
	redirectUri: string,
): Promise<PageResult> {
	if (config === true) {
		return {
			status: 500,
			html: errorPage(
				"Google pages require { clientId, clientSecret } configuration",
			),
		};
	}

	if (!query.code || !query.state) {
		return {
			status: 400,
			html: errorPage("Missing code or state parameter"),
		};
	}

	try {
		const { handleCallback } = await import("@lynq/google");
		const opts: Parameters<typeof handleCallback>[2] = {
			clientId: config.clientId,
			clientSecret: config.clientSecret,
			redirectUri,
		};
		if (config.sessionKey) opts.sessionKey = config.sessionKey;
		const result = await handleCallback(
			server,
			{ code: query.code, state: query.state },
			opts,
		);

		if (!result.success) {
			return {
				status: 500,
				html: errorPage(result.error ?? "Authentication failed"),
			};
		}

		return { status: 302, redirect: `${prefix}/auth/success` };
	} catch (err) {
		return {
			status: 500,
			html: errorPage(err instanceof Error ? err.message : String(err)),
		};
	}
}

async function handleStripePage(
	server: MCPServer,
	query: {
		session_id: string | undefined;
		cancelled: string | undefined;
		state: string | undefined;
	},
	config: true | StripePagesConfig,
	prefix: string,
): Promise<PageResult> {
	if (config === true) {
		return {
			status: 500,
			html: errorPage("Stripe pages require { secretKey } configuration"),
		};
	}

	if (query.cancelled === "true") {
		return { status: 200, html: errorPage("Payment was cancelled") };
	}

	if (!query.session_id || !query.state) {
		return {
			status: 400,
			html: errorPage("Missing session_id or state parameter"),
		};
	}

	try {
		const { handleCallback } = await import("@lynq/stripe");
		const opts: Parameters<typeof handleCallback>[2] = {
			secretKey: config.secretKey,
		};
		if (config.sessionKey) opts.sessionKey = config.sessionKey;
		const result = await handleCallback(
			server,
			{
				checkoutSessionId: query.session_id,
				state: query.state,
			},
			opts,
		);

		if (!result.success) {
			return {
				status: 500,
				html: errorPage(result.error ?? "Payment verification failed"),
			};
		}

		return { status: 302, redirect: `${prefix}/payment/success` };
	} catch (err) {
		return {
			status: 500,
			html: errorPage(err instanceof Error ? err.message : String(err)),
		};
	}
}

function handleCryptoGet(
	query: {
		recipient: string | undefined;
		amount: string | undefined;
		token: string | undefined;
		network: string | undefined;
		state: string | undefined;
	},
	callbackUrl: string,
): PageResult {
	if (!query.recipient || !query.amount || !query.state) {
		return {
			status: 400,
			html: errorPage("Missing required payment parameters"),
		};
	}

	return {
		status: 200,
		html: cryptoPaymentPage({
			recipient: query.recipient,
			amount: query.amount,
			token: query.token ?? "USDC",
			network: query.network ?? "base",
			state: query.state,
			callbackUrl,
		}),
	};
}

async function handleCryptoPost(
	server: MCPServer,
	body: {
		txHash: string | undefined;
		state: string | undefined;
		recipient: string | undefined;
		amount: string | undefined;
	},
	config: true | CryptoPagesConfig,
): Promise<PageResult> {
	if (!body.txHash || !body.state || !body.recipient || !body.amount) {
		return {
			status: 400,
			json: {
				success: false,
				error: "Missing txHash, state, recipient, or amount",
			},
		};
	}

	try {
		const { handleCallback } = await import("@lynq/crypto");
		const opts: Parameters<typeof handleCallback>[2] = {
			recipient: body.recipient,
			amount: Number(body.amount),
		};
		if (config !== true) {
			if (config.rpcUrl) opts.rpcUrl = config.rpcUrl;
			if (config.sessionKey) opts.sessionKey = config.sessionKey;
		}
		const result = await handleCallback(
			server,
			{ txHash: body.txHash, state: body.state },
			opts,
		);

		return { status: result.success ? 200 : 500, json: result };
	} catch (err) {
		return {
			status: 500,
			json: {
				success: false,
				error: err instanceof Error ? err.message : String(err),
			},
		};
	}
}

// ── Page Registration ─────────────────────────────────────────────────

function registerPages(
	app: Hono,
	server: MCPServer,
	options: MountOptions,
): void {
	const prefix = options.pagesPrefix ?? "/lynq";
	const pages = options.pages as PagesConfig;

	if (pages.github && typeof pages.github !== "string") {
		app.get(`${prefix}/auth/github/callback`, async (c: Context) => {
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
