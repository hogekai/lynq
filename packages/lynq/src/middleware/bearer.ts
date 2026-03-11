import { error } from "../response.js";
import type { ToolMiddleware } from "../types.js";

export interface BearerOptions {
	/** Middleware name. Default: "bearer" */
	name?: string;
	/** Session key where the raw token is stored. Default: "token" */
	tokenKey?: string;
	/** Session key to store verified user. Default: "user" */
	sessionKey?: string;
	/** Verify the token. Return user data or null/throw on failure. */
	verify: (token: string) => Promise<unknown | null>;
	/** Error message. Default: "Invalid or missing token." */
	message?: string;
}

export function bearer(options: BearerOptions): ToolMiddleware {
	const name = options.name ?? "bearer";
	const tokenKey = options.tokenKey ?? "token";
	const sessionKey = options.sessionKey ?? "user";
	const message = options.message ?? "Invalid or missing token.";

	return {
		name,
		onRegister() {
			return false;
		},
		async onCall(c, next) {
			if (c.session.get(sessionKey)) return next();

			const token = c.session.get<string>(tokenKey);
			if (!token) return error(message);

			const user = await options.verify(token);
			if (!user) return error(message);

			c.session.set(sessionKey, user);
			c.session.authorize(name);
			return next();
		},
	};
}
