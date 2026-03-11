import type { MCPServer, ToolContext, ToolMiddleware } from "../types.js";
import { payment } from "./payment.js";

export interface CryptoPaymentOptions {
	/** Middleware name. Default: "crypto" */
	name?: string;
	/** Token symbol. Default: "USDC" */
	token?: "USDC" | "USDT" | "DAI" | "ETH" | string;
	/** Recipient wallet address. */
	recipient: string;
	/** Amount in token units. */
	amount: number;
	/** Network. Default: "base" */
	network?:
		| "base"
		| "base-sepolia"
		| "ethereum"
		| "polygon"
		| "solana"
		| string;
	/** Base URL of your server. */
	baseUrl: string;
	/** Callback path. Default: "/payment/crypto/callback" */
	callbackPath?: string;
	/** Session key for payment data. Default: "payment" */
	sessionKey?: string;
	/** If true, only charge once per session per tool. Default: false */
	once?: boolean;
	/** Message shown to user. */
	message?: string;
	/** Timeout in ms. Default: 300000 */
	timeout?: number;
	/** Custom skip condition. Takes priority over sessionKey check. */
	skipIf?: (c: ToolContext) => boolean | Promise<boolean>;
	/** Called after payment completes successfully, before next(). */
	onComplete?: (c: ToolContext) => void | Promise<void>;
}

/** @deprecated Use `CryptoPaymentOptions` instead. */
export type UsdcPaymentOptions = CryptoPaymentOptions;

export function crypto(options: CryptoPaymentOptions): ToolMiddleware {
	const {
		recipient,
		amount,
		token = "USDC",
		network = "base",
		baseUrl,
		callbackPath = "/payment/crypto/callback",
		once = false,
	} = options;

	const name = options.name ?? "crypto";
	const sessionKey = options.sessionKey ?? "payment";
	const message = options.message ?? `Payment required (${amount} ${token}).`;

	const opts: Parameters<typeof payment>[0] = {
		name,
		sessionKey,
		message,
		buildUrl: ({ sessionId, elicitationId }) => {
			const params = new URLSearchParams({
				recipient,
				amount: String(amount),
				token,
				network,
				state: `${sessionId}:${elicitationId}`,
			});
			return `${baseUrl}${callbackPath}?${params}`;
		},
	};
	if (options.timeout !== undefined) opts.timeout = options.timeout;
	if (options.skipIf) opts.skipIf = options.skipIf;
	if (options.onComplete) opts.onComplete = options.onComplete;
	const base = payment(opts);

	if (once) return base;

	return {
		...base,
		onResult(result, c) {
			c.session.set(sessionKey, undefined);
			return result;
		},
	};
}

/** @deprecated Use `crypto()` from `lynq/crypto` instead. */
export const usdcPayment = crypto;

export interface HandleCallbackOptions {
	/** RPC URL for the network. */
	rpcUrl?: string;
	/** Expected recipient address. */
	recipient: string;
	/** Expected amount. */
	amount: number;
	/** Session key. Default: "payment" */
	sessionKey?: string;
}

/** @deprecated Use `HandleCallbackOptions` instead. */
export type HandleUsdcCallbackOptions = HandleCallbackOptions;

/**
 * Handle crypto payment callback. Call from your HTTP callback route.
 * Verifies the on-chain transaction, stores in session, and completes elicitation.
 */
export async function handleCallback(
	server: MCPServer,
	params: { state: string; txHash: string },
	options: HandleCallbackOptions,
): Promise<{ success: boolean; error?: string }> {
	const sessionKey = options.sessionKey ?? "payment";
	const [sessionId, elicitationId] = params.state.split(":");

	if (!sessionId || !elicitationId) {
		return { success: false, error: "Invalid state parameter" };
	}

	try {
		const verified = await verifyTransaction(params.txHash, options);

		if (!verified) {
			return { success: false, error: "Transaction verification failed" };
		}

		const session = server.session(sessionId);
		session.set(sessionKey, {
			provider: "crypto",
			txHash: params.txHash,
			amount: options.amount,
			recipient: options.recipient,
			paidAt: new Date().toISOString(),
		});

		server.completeElicitation(elicitationId);
		return { success: true };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/** @deprecated Use `handleCallback()` from `lynq/crypto` instead. */
export const handleUsdcCallback = handleCallback;

async function verifyTransaction(
	txHash: string,
	options: HandleCallbackOptions,
): Promise<boolean> {
	const rpcUrl = options.rpcUrl ?? "https://mainnet.base.org";

	try {
		const response = await fetch(rpcUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "eth_getTransactionReceipt",
				params: [txHash],
			}),
		});

		const data = (await response.json()) as {
			result?: { status: string } | null;
		};

		return data.result?.status === "0x1";
	} catch {
		return false;
	}
}
