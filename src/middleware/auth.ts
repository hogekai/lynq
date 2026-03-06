import { error } from "../response.js";
import type { ToolMiddleware } from "../types.js";

export interface AuthOptions {
	/** Session key to check for authentication. Default: "user" */
	sessionKey?: string;
	/** Error message when not authenticated. */
	message?: string;
}

export function auth(options?: AuthOptions): ToolMiddleware {
	const sessionKey = options?.sessionKey ?? "user";
	const message =
		options?.message ?? "Authentication required. Please login first.";

	return {
		name: "auth",
		onRegister() {
			return false;
		},
		async onCall(ctx, next) {
			const value = ctx.session.get(sessionKey);
			if (!value) {
				return error(message);
			}
			return next();
		},
	};
}
