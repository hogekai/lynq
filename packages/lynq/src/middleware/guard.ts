import { error } from "../response.js";
import type { ToolMiddleware } from "../types.js";

export interface GuardOptions {
	/** Middleware name. Used for authorize()/revoke(). Default: "guard" */
	name?: string;
	/** Session key to check. Default: "user" */
	sessionKey?: string;
	/** Error message when not authorized. */
	message?: string;
}

export function guard(options?: GuardOptions): ToolMiddleware {
	const name = options?.name ?? "guard";
	const sessionKey = options?.sessionKey ?? "user";
	const message = options?.message ?? "Authorization required.";

	return {
		name,
		onRegister() {
			return false;
		},
		async onCall(c, next) {
			const value = c.session.get(sessionKey);
			if (!value) {
				return error(message);
			}
			return next();
		},
	};
}
