import type { MCPServer, ToolMiddleware } from "../types.js";
import { payment } from "./payment.js";

export interface UsdcPaymentOptions {
	/** Middleware name. Default: "usdc" */
	name?: string;
	/** Recipient wallet address. */
	recipient: string;
	/** Amount in USDC (e.g., 0.01 = $0.01). */
	amount: number;
	/** Network. Default: "base" */
	network?: "base" | "base-sepolia" | "ethereum" | "polygon" | "solana";
	/** Base URL of your server. */
	baseUrl: string;
	/** Callback path. Default: "/payment/usdc/callback" */
	callbackPath?: string;
	/** Session key for payment data. Default: "payment" */
	sessionKey?: string;
	/** If true, only charge once per session per tool. Default: false */
	once?: boolean;
	/** Message shown to user. */
	message?: string;
	/** Timeout in ms. Default: 300000 */
	timeout?: number;
}

export function usdcPayment(options: UsdcPaymentOptions): ToolMiddleware {
	const {
		recipient,
		amount,
		network = "base",
		baseUrl,
		callbackPath = "/payment/usdc/callback",
		once = false,
	} = options;

	const name = options.name ?? "usdc";
	const sessionKey = options.sessionKey ?? "payment";
	const message = options.message ?? `Payment required (${amount} USDC).`;

	const opts: Parameters<typeof payment>[0] = {
		name,
		sessionKey,
		message,
		buildUrl: ({ sessionId, elicitationId }) => {
			const params = new URLSearchParams({
				recipient,
				amount: String(amount),
				network,
				state: `${sessionId}:${elicitationId}`,
			});
			return `${baseUrl}${callbackPath}?${params}`;
		},
	};
	if (options.timeout !== undefined) opts.timeout = options.timeout;
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

export interface HandleUsdcCallbackOptions {
	/** RPC URL for the network. */
	rpcUrl?: string;
	/** Expected recipient address. */
	recipient: string;
	/** Expected amount. */
	amount: number;
	/** Session key. Default: "payment" */
	sessionKey?: string;
}

export async function handleUsdcCallback(
	server: MCPServer,
	params: { state: string; txHash: string },
	options: HandleUsdcCallbackOptions,
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
			provider: "usdc",
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

async function verifyTransaction(
	txHash: string,
	options: HandleUsdcCallbackOptions,
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
