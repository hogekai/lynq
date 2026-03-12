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
import type {
	Express,
	Request as ExpressReq,
	Response as ExpressRes,
} from "express";

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

function toWebRequest(req: ExpressReq): Request {
	const protocol = req.protocol || "http";
	const host = req.headers.host || "localhost";
	const url = `${protocol}://${host}${req.originalUrl}`;

	const headers = new Headers();
	for (const [key, value] of Object.entries(req.headers)) {
		if (value) {
			headers.set(key, Array.isArray(value) ? value.join(", ") : value);
		}
	}

	const init: RequestInit = { method: req.method, headers };
	if (req.method !== "GET" && req.method !== "HEAD") {
		// Re-serialize pre-parsed body for Web Standard Request
		init.body = JSON.stringify(req.body);
	}
	return new Request(url, init);
}

async function sendWebResponse(
	res: ExpressRes,
	webRes: Response,
): Promise<void> {
	res.status(webRes.status);
	webRes.headers.forEach((value, key) => res.setHeader(key, value));

	if (webRes.body) {
		const reader = webRes.body.getReader();
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				res.write(value);
			}
		} finally {
			res.end();
		}
	} else {
		res.end();
	}
}

export function mountLynq(
	app: Express,
	server: MCPServer,
	options?: MountOptions,
): void {
	const path = options?.path ?? "/mcp";
	const handler = server.http();
	const allowed = options?.allowedHosts ?? [...LOCALHOST_HOSTS];

	app.use(path, (req, res, next) => {
		if (!validateHost(req.headers.host ?? null, allowed)) {
			res.status(403).json({
				jsonrpc: "2.0",
				error: { code: -32000, message: "Forbidden" },
				id: null,
			});
			return;
		}
		next();
	});

	app.all(path, async (req, res) => {
		const webReq = toWebRequest(req);
		const webRes = await handler(webReq);
		await sendWebResponse(res, webRes);
	});

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

function getOrigin(req: ExpressReq): string {
	const protocol = req.protocol || "http";
	const host = req.headers.host || "localhost";
	return `${protocol}://${host}`;
}

function registerPages(
	app: Express,
	server: MCPServer,
	options: MountOptions,
): void {
	const prefix = options.pagesPrefix ?? "/lynq";
	const pages = options.pages as PagesConfig;

	if (pages.github && typeof pages.github !== "string") {
		const config = pages.github;
		app.get(`${prefix}/auth/github/callback`, async (req, res) => {
			const result = await handleGitHubPage(
				server,
				{
					code: req.query.code as string | undefined,
					state: req.query.state as string | undefined,
				},
				config,
				prefix,
			);
			if (result.redirect) return res.redirect(result.redirect);
			res.status(result.status).send(result.html);
		});
	} else if (typeof pages.github === "string") {
		const target = pages.github;
		app.get(`${prefix}/auth/github/callback`, (req, res) => {
			const url = new URL(target, getOrigin(req));
			for (const [k, v] of Object.entries(req.query)) {
				if (typeof v === "string") url.searchParams.set(k, v);
			}
			res.redirect(url.toString());
		});
	}

	if (pages.google && typeof pages.google !== "string") {
		const config = pages.google;
		app.get(`${prefix}/auth/google/callback`, async (req, res) => {
			const redirectUri = `${getOrigin(req)}${prefix}/auth/google/callback`;
			const result = await handleGooglePage(
				server,
				{
					code: req.query.code as string | undefined,
					state: req.query.state as string | undefined,
				},
				config,
				prefix,
				redirectUri,
			);
			if (result.redirect) return res.redirect(result.redirect);
			res.status(result.status).send(result.html);
		});
	} else if (typeof pages.google === "string") {
		const target = pages.google;
		app.get(`${prefix}/auth/google/callback`, (req, res) => {
			const url = new URL(target, getOrigin(req));
			for (const [k, v] of Object.entries(req.query)) {
				if (typeof v === "string") url.searchParams.set(k, v);
			}
			res.redirect(url.toString());
		});
	}

	if (pages.stripe && typeof pages.stripe !== "string") {
		const config = pages.stripe;
		app.get(`${prefix}/payment/stripe/callback`, async (req, res) => {
			const result = await handleStripePage(
				server,
				{
					session_id: req.query.session_id as string | undefined,
					cancelled: req.query.cancelled as string | undefined,
					state: req.query.state as string | undefined,
				},
				config,
				prefix,
			);
			if (result.redirect) return res.redirect(result.redirect);
			res.status(result.status).send(result.html);
		});
	} else if (typeof pages.stripe === "string") {
		const target = pages.stripe;
		app.get(`${prefix}/payment/stripe/callback`, (req, res) => {
			const url = new URL(target, getOrigin(req));
			for (const [k, v] of Object.entries(req.query)) {
				if (typeof v === "string") url.searchParams.set(k, v);
			}
			res.redirect(url.toString());
		});
	}

	if (pages.crypto && typeof pages.crypto !== "string") {
		const cryptoConfig = pages.crypto;
		app.get(`${prefix}/payment/crypto`, async (req, res) => {
			const callbackUrl = `${getOrigin(req)}${prefix}/payment/crypto/callback`;
			const result = handleCryptoGet(
				{
					recipient: req.query.recipient as string | undefined,
					amount: req.query.amount as string | undefined,
					token: req.query.token as string | undefined,
					network: req.query.network as string | undefined,
					state: req.query.state as string | undefined,
				},
				callbackUrl,
			);
			res.status(result.status).send(result.html);
		});

		app.post(`${prefix}/payment/crypto/callback`, async (req, res) => {
			const result = await handleCryptoPost(server, req.body, cryptoConfig);
			res.status(result.status).json(result.json);
		});
	} else if (typeof pages.crypto === "string") {
		const target = pages.crypto;
		app.get(`${prefix}/payment/crypto`, (req, res) => {
			const url = new URL(target, getOrigin(req));
			for (const [k, v] of Object.entries(req.query)) {
				if (typeof v === "string") url.searchParams.set(k, v);
			}
			res.redirect(url.toString());
		});
	}

	// Shared success pages (registered when any provider is configured)
	app.get(`${prefix}/auth/success`, (_req, res) => {
		res.send(successPage("Authentication"));
	});
	app.get(`${prefix}/payment/success`, (_req, res) => {
		res.send(successPage("Payment"));
	});
}
