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
	/** Custom skip condition. Takes priority over sessionKey check. */
	skipIf?: (c: ToolContext) => boolean | Promise<boolean>;
	/** Called after payment verification succeeds, before next(). */
	onComplete?: (c: ToolContext) => void | Promise<void>;
}

// === JSON Schema with x-lynq-payment flag ===

/** Payment proof JSON Schema. `x-lynq-payment` identifies this as a payment elicitation and carries payment details. */
export interface PaymentSchemaExtension {
	"x-lynq-payment": PaymentRequest;
}

function buildProofSchema(request: PaymentRequest) {
	return {
		type: "object" as const,
		properties: {
			type: { type: "string" as const, enum: ["signature", "tx_hash"] },
			value: { type: "string" as const },
		},
		required: ["type", "value"],
		"x-lynq-payment": request,
	};
}

// === Middleware ===

export function agentPayment(options: AgentPaymentOptions): ToolMiddleware {
	const name = options.name ?? "agent-payment";
	const sessionKey = options.sessionKey ?? "agent-payment";
	const token = options.token ?? "USDC";
	const network = options.network ?? "base";
	const once = options.once ?? true;
	const message =
		options.message ??
		`Payment required: ${options.amount} ${token} to ${options.recipient} on ${network}.`;

	const request: PaymentRequest = {
		recipient: options.recipient,
		amount: options.amount,
		network,
		token,
	};

	const middleware: ToolMiddleware = {
		name,
		async onCall(c, next) {
			// Skip check
			if (options.skipIf) {
				if (await Promise.resolve(options.skipIf(c))) return next();
			} else if (once && c.session.get(sessionKey)) {
				return next();
			}

			// Elicit proof from agent using JSON Schema directly (not Zod)
			// so x-lynq-payment flag is preserved in the wire format
			const result = await c.elicit.form(message, buildProofSchema(request));

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

	// If not once, clear session key after each call
	if (!once) {
		middleware.onResult = (result, c) => {
			c.session.set(sessionKey, undefined);
			return result;
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
