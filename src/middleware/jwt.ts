import { error } from "../response.js";
import type { ToolMiddleware } from "../types.js";

export interface JwtOptions {
	/** Middleware name. Default: "jwt" */
	name?: string;
	/** Session key where the raw token is stored. Default: "token" */
	tokenKey?: string;
	/** Session key to store decoded payload. Default: "user" */
	sessionKey?: string;
	/** Symmetric secret for HMAC verification. */
	secret?: string;
	/** JWKS URI for remote key fetching. */
	jwksUri?: string;
	/** Expected issuer claim. */
	issuer?: string;
	/** Expected audience claim. */
	audience?: string;
	/** Additional validation on the decoded payload. Return user data or null. */
	validate?: (
		payload: Record<string, unknown>,
	) => unknown | null | Promise<unknown | null>;
	/** Error message. Default: "Invalid or expired JWT." */
	message?: string;
}

export function jwt(options: JwtOptions): ToolMiddleware {
	const name = options.name ?? "jwt";
	const tokenKey = options.tokenKey ?? "token";
	const sessionKey = options.sessionKey ?? "user";
	const message = options.message ?? "Invalid or expired JWT.";

	// biome-ignore lint/suspicious/noExplicitAny: lazy-loaded jose module
	let josePromise: Promise<any> | null = null;
	function loadJose() {
		if (!josePromise) {
			josePromise = import("jose").catch(() => {
				josePromise = null;
				return null;
			});
		}
		return josePromise;
	}

	return {
		name,
		onRegister() {
			return false;
		},
		async onCall(c, next) {
			if (c.session.get(sessionKey)) return next();

			const token = c.session.get<string>(tokenKey);
			if (!token) return error("JWT required.");

			const jose = await loadJose();
			if (!jose) {
				return error(
					"jose library is required for JWT middleware. Install it: pnpm add jose",
				);
			}

			try {
				// biome-ignore lint/suspicious/noExplicitAny: jose types from dynamic import
				let payload: Record<string, any>;

				if (options.jwksUri) {
					const jwks = jose.createRemoteJWKSet(new URL(options.jwksUri));
					const result = await jose.jwtVerify(token, jwks, {
						issuer: options.issuer,
						audience: options.audience,
					});
					payload = result.payload;
				} else if (options.secret) {
					const key = new TextEncoder().encode(options.secret);
					const result = await jose.jwtVerify(token, key, {
						issuer: options.issuer,
						audience: options.audience,
					});
					payload = result.payload;
				} else {
					return error(
						"JWT middleware misconfigured: provide secret or jwksUri.",
					);
				}

				const user = options.validate
					? await options.validate(payload)
					: payload;
				if (!user) return error(message);

				c.session.set(sessionKey, user);
				c.session.authorize(name);
				return next();
			} catch {
				return error(message);
			}
		},
	};
}
