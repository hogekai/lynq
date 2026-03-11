import type { ToolContext, ToolMiddleware } from "../types.js";
import { urlAction } from "./url-action.js";

export interface OAuthOptions {
	/** Middleware name. Default: "oauth" */
	name?: string;
	/** Session key for storing tokens. Default: "user" */
	sessionKey?: string;
	/** Message shown to the user. Default: "Please sign in to continue." */
	message?: string;
	/** Build the OAuth authorization URL. */
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
	/** Called after authentication completes successfully, before next(). */
	onComplete?: (c: ToolContext) => void | Promise<void>;
}

export function oauth(options: OAuthOptions): ToolMiddleware {
	const opts: Parameters<typeof urlAction>[0] = {
		name: options.name ?? "oauth",
		sessionKey: options.sessionKey ?? "user",
		message: options.message ?? "Please sign in to continue.",
		buildUrl: options.buildUrl,
		declineMessage: "Authentication cancelled.",
	};
	if (options.timeout !== undefined) opts.timeout = options.timeout;
	if (options.persistent !== undefined) opts.persistent = options.persistent;
	if (options.skipIf) opts.skipIf = options.skipIf;
	if (options.onComplete) opts.onComplete = options.onComplete;
	return urlAction(opts);
}
