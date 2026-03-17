import { error } from "../response.js";
import type { ToolContext, ToolMiddleware } from "../types.js";

// === Types ===

export interface PaymentRequest {
	/** Recipient wallet address. */
	recipient: string;
	/** Amount in token units (string for decimal precision). */
	amount: string;
	/** Network identifier (e.g., "base", "ethereum", "solana"). */
	network: string;
	/** Token symbol (e.g., "USDC", "ETH"). */
	token: string;
}

export interface PaymentProof {
	/** Proof type. "signature" = facilitator-verified, "tx_hash" = on-chain. */
	type: "signature" | "tx_hash";
	/** The signature or transaction hash. */
	value: string;
}

export type VerifyFn = (
	proof: PaymentProof,
	request: PaymentRequest,
) => Promise<boolean>;

export interface AgentPaymentOptions {
	/** Middleware name. Default: "agent-payment" */
	name?: string;
	/** Recipient wallet address. */
	recipient: string;
	/** Amount in token units (string for decimal precision). */
	amount: string;
	/** Token symbol. Default: "USDC" */
	token?: string;
	/** Network identifier. Default: "base" */
	network?: string;
	/** Session key for storing payment proof. Default: "agent-payment" */
	sessionKey?: string;
	/** Message shown in elicitation form. */
	message?: string;
	/** If true, skip after first successful verification in session. Default: true */
	once?: boolean;
	/** Verify payment proof. Return true if valid. */
	verify: VerifyFn;
	/** Append payment receipt to tool result. Default: true */
	receipt?: boolean;
	/** Custom skip condition. Takes priority over sessionKey check. */
	skipIf?: (c: ToolContext) => boolean | Promise<boolean>;
	/** Called after payment verification succeeds, before next(). */
	onComplete?: (c: ToolContext) => void | Promise<void>;
}

// === Proof schema (raw JSON Schema, no Zod dependency) ===

const PROOF_SCHEMA = {
	type: "object" as const,
	properties: {
		type: { type: "string" as const, enum: ["signature", "tx_hash"] },
		value: { type: "string" as const },
	},
	required: ["type", "value"],
};

/**
 * Build elicitation message with embedded payment metadata.
 * Format: human-readable text + `\n[x-lynq-payment:{json}]` tag.
 * Wallets detect the tag, not the human text.
 */
function buildMessage(text: string, request: PaymentRequest): string {
	return `${text}\n[x-lynq-payment:${JSON.stringify(request)}]`;
}

/** Extract payment metadata from an elicitation message. Returns null if not a payment. */
export function parsePaymentMeta(message: string): PaymentRequest | null {
	const match = message.match(/\[x-lynq-payment:(\{[^}]+\})\]/);
	if (!match) return null;
	try {
		return JSON.parse(match[1]) as PaymentRequest;
	} catch {
		return null;
	}
}

// === Middleware ===

export function agentPayment(options: AgentPaymentOptions): ToolMiddleware {
	const name = options.name ?? "agent-payment";
	const sessionKey = options.sessionKey ?? "agent-payment";
	const token = options.token ?? "USDC";
	const network = options.network ?? "base";
	const once = options.once ?? true;
	const request: PaymentRequest = {
		recipient: options.recipient,
		amount: options.amount,
		network,
		token,
	};

	const humanMessage =
		options.message ??
		`Payment required: ${options.amount} ${token} to ${options.recipient} on ${network}.`;
	const message = buildMessage(humanMessage, request);

	const middleware: ToolMiddleware = {
		name,
		async onCall(c, next) {
			// Skip check
			if (options.skipIf) {
				if (await Promise.resolve(options.skipIf(c))) return next();
			} else if (once && c.session.get(sessionKey)) {
				return next();
			}

			// Elicit proof from agent
			const result = await c.elicit.form(message, PROOF_SCHEMA);

			if (result.action !== "accept") {
				return error("Payment cancelled.");
			}

			const content = result.content as Record<string, unknown>;
			const proof: PaymentProof = {
				type: content.type as PaymentProof["type"],
				value: content.value as string,
			};

			// Verify
			const valid = await options.verify(proof, request);
			if (!valid) {
				return error("Payment verification failed.");
			}

			// Store proof in session
			c.session.set(sessionKey, {
				...proof,
				amount: options.amount,
				recipient: options.recipient,
				token,
				network,
				paidAt: new Date().toISOString(),
			});

			if (options.onComplete) {
				await Promise.resolve(options.onComplete(c));
			}

			return next();
		},
	};

	const receipt = options.receipt ?? true;

	if (receipt || !once) {
		middleware.onResult = (result, c) => {
			let out = result;
			if (receipt) {
				const payment = c.session.get(sessionKey) as
					| Record<string, unknown>
					| undefined;
				if (payment?.paidAt) {
					out = {
						...out,
						content: [
							...(out.content ?? []),
							{
								type: "text" as const,
								text: JSON.stringify({
									_lynq_payment: {
										amount: payment.amount,
										token: payment.token,
										recipient: payment.recipient,
										tx: payment.value,
										network: payment.network,
										paidAt: payment.paidAt,
									},
								}),
							},
						],
					};
				}
			}
			if (!once) {
				c.session.set(sessionKey, undefined);
			}
			return out;
		};
	}

	return middleware;
}

// === Verify helpers ===

/**
 * Verify a tx_hash proof by checking on-chain transaction receipt.
 */
export function verifyOnChain(opts?: {
	/** JSON-RPC URL. Default: "https://mainnet.base.org" */
	rpcUrl?: string;
}): VerifyFn {
	const rpcUrl = opts?.rpcUrl ?? "https://mainnet.base.org";
	return async (proof) => {
		if (proof.type !== "tx_hash") return false;
		try {
			const response = await fetch(rpcUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "eth_getTransactionReceipt",
					params: [proof.value],
				}),
			});
			const data = (await response.json()) as {
				result?: { status: string } | null;
			};
			return data.result?.status === "0x1";
		} catch {
			return false;
		}
	};
}

/**
 * Verify a signature proof by forwarding to a facilitator endpoint.
 */
export function verifyViaFacilitator(opts: {
	/** Facilitator URL. */
	url: string;
}): VerifyFn {
	return async (proof, request) => {
		if (proof.type !== "signature") return false;
		try {
			const response = await fetch(opts.url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ proof, request }),
			});
			const data = (await response.json()) as { valid?: boolean };
			return data.valid === true;
		} catch {
			return false;
		}
	};
}
