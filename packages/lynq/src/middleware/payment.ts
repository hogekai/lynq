import type { ToolContext, ToolMiddleware } from "../types.js";
import { urlAction } from "./url-action.js";

export interface PaymentOptions {
	/** Middleware name. Default: "payment" */
	name?: string;
	/** Session key for storing payment confirmation. Default: "payment" */
	sessionKey?: string;
	/** Message shown to the user. Default: "Please complete payment to continue." */
	message?: string;
	/** Build the payment page URL. */
	buildUrl: (params: {
		sessionId: string;
		elicitationId: string;
	}) => string | Promise<string>;
	/** Timeout in ms. Default: 300000 */
	timeout?: number;
	/** Use persistent store (userStore) instead of session for state. Default: false */
	persistent?: boolean;
	/** Custom skip condition. Takes priority over sessionKey check. */
	skipIf?: (c: ToolContext) => boolean | Promise<boolean>;
	/** Called after payment completes successfully, before next(). */
	onComplete?: (c: ToolContext) => void | Promise<void>;
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
	if (options.persistent !== undefined) opts.persistent = options.persistent;
	if (options.skipIf) opts.skipIf = options.skipIf;
	if (options.onComplete) opts.onComplete = options.onComplete;
	return urlAction(opts);
}
