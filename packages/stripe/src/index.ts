import type { MCPServer, ToolContext, ToolMiddleware } from "@lynq/lynq";
import { signState, verifyState } from "@lynq/lynq/helpers";
import { payment } from "@lynq/lynq/payment";

export interface StripeOptions {
	/** Middleware name. Default: "stripe" */
	name?: string;
	/** Stripe secret key (server-side). */
	secretKey: string;
	/** Base URL of your server (for callback URLs). */
	baseUrl: string;
	/** Callback path. Default: "/payment/stripe/callback" */
	callbackPath?: string;
	/** Price in cents (USD). e.g., 100 = $1.00 */
	amount: number;
	/** Currency. Default: "usd" */
	currency?: string;
	/** Product description shown on Stripe Checkout. */
	description?: string;
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

/** @deprecated Use `StripeOptions` instead. */
export type StripePaymentOptions = StripeOptions;

// biome-ignore lint/suspicious/noExplicitAny: lazy-loaded stripe module
let stripePromise: Promise<any> | null = null;
function loadStripe() {
	if (!stripePromise) {
		stripePromise = import("stripe").catch(() => {
			stripePromise = null;
			return null;
		});
	}
	return stripePromise;
}

export function stripe(options: StripeOptions): ToolMiddleware {
	const {
		secretKey,
		baseUrl,
		callbackPath = "/payment/stripe/callback",
		amount,
		currency = "usd",
		description,
		once = false,
	} = options;

	const name = options.name ?? "stripe";
	const sessionKey = options.sessionKey ?? "payment";
	const message =
		options.message ?? `Payment required ($${(amount / 100).toFixed(2)}).`;

	const opts: Parameters<typeof payment>[0] = {
		name,
		sessionKey,
		message,
		async buildUrl({ sessionId, elicitationId }) {
			const mod = await loadStripe();
			if (!mod) {
				throw new Error(
					"stripe package is required. Install it: pnpm add stripe",
				);
			}
			const Stripe = mod.default;
			const client = new Stripe(secretKey);

			const state = signState(sessionId, elicitationId, secretKey);
			const session = await client.checkout.sessions.create({
				payment_method_types: ["card"],
				line_items: [
					{
						price_data: {
							currency,
							product_data: {
								name: description ?? "Tool access",
							},
							unit_amount: amount,
						},
						quantity: 1,
					},
				],
				mode: "payment",
				success_url: `${baseUrl}${callbackPath}?session_id={CHECKOUT_SESSION_ID}&state=${state}`,
				cancel_url: `${baseUrl}${callbackPath}?cancelled=true&state=${state}`,
				metadata: { sessionId, elicitationId },
			});

			return session.url ?? "";
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

/** @deprecated Use `stripe()` from `@lynq/stripe` instead. */
export const stripePayment = stripe;

export interface HandleCallbackOptions {
	/** Stripe secret key. */
	secretKey: string;
	/** Session key. Default: "payment" */
	sessionKey?: string;
}

/** @deprecated Use `HandleCallbackOptions` instead. */
export type HandleStripeCallbackOptions = HandleCallbackOptions;

/**
 * Handle Stripe Checkout callback. Call from your HTTP callback route.
 * Retrieves the Checkout Session, verifies payment, stores in session, and completes elicitation.
 */
export async function handleCallback(
	server: MCPServer,
	params: { checkoutSessionId: string; state: string },
	options: HandleCallbackOptions,
): Promise<{ success: boolean; error?: string }> {
	const sessionKey = options.sessionKey ?? "payment";
	const verified = verifyState(params.state, options.secretKey);

	if (!verified) {
		return { success: false, error: "Invalid state parameter" };
	}

	const { sessionId, elicitationId } = verified;

	try {
		// biome-ignore lint/suspicious/noExplicitAny: dynamic import of stripe SDK
		let stripeMod: { default: new (key: string) => any };
		try {
			stripeMod = await import("stripe");
		} catch {
			return {
				success: false,
				error: "stripe package is required. Install it: pnpm add stripe",
			};
		}
		const Stripe = stripeMod.default;
		const client = new Stripe(options.secretKey);

		const checkout = await client.checkout.sessions.retrieve(
			params.checkoutSessionId,
		);

		if (checkout.payment_status !== "paid") {
			return { success: false, error: "Payment not completed" };
		}

		const session = server.session(sessionId);
		session.set(sessionKey, {
			provider: "stripe",
			checkoutSessionId: checkout.id,
			amount: checkout.amount_total,
			currency: checkout.currency,
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

/** @deprecated Use `handleCallback()` from `@lynq/stripe` instead. */
export const handleStripeCallback = handleCallback;
