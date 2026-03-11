import type { ToolMiddleware } from "../types.js";
import { urlAction } from "./url-action.js";

export interface PaymentOptions {
	/** Middleware name. Default: "payment" */
	name?: string;
	/** Session key for storing payment confirmation. Default: "payment" */
	sessionKey?: string;
	/** Message shown to the user. Default: "Please complete payment to continue." */
	message?: string;
	/** Build the payment page URL. */
	buildUrl: (params: { sessionId: string; elicitationId: string }) => string;
	/** Timeout in ms. Default: 300000 */
	timeout?: number;
}

export function payment(options: PaymentOptions): ToolMiddleware {
	const opts: Parameters<typeof urlAction>[0] = {
		name: options.name ?? "payment",
		sessionKey: options.sessionKey ?? "payment",
		message: options.message ?? "Please complete payment to continue.",
		buildUrl: options.buildUrl,
		declineMessage: "Payment cancelled.",
	};
	if (options.timeout !== undefined) opts.timeout = options.timeout;
	return urlAction(opts);
}
