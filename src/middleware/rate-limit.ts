import { error } from "../response.js";
import type { ToolMiddleware } from "../types.js";

export interface RateLimitOptions {
	/** Maximum calls per window. */
	max: number;
	/** Window duration in milliseconds. Default: 60000 (1 minute) */
	windowMs?: number;
	/** Error message. */
	message?: string;
}

export function rateLimit(options: RateLimitOptions): ToolMiddleware {
	const { max, windowMs = 60_000 } = options;
	const message =
		options.message ??
		`Rate limit exceeded. Max ${max} calls per ${windowMs / 1000}s.`;

	return {
		name: "rateLimit",
		async onCall(ctx, next) {
			const key = `rateLimit:${ctx.toolName}`;
			const state = ctx.session.get<{ count: number; resetAt: number }>(key);
			const now = Date.now();

			if (!state || now >= state.resetAt) {
				ctx.session.set(key, { count: 1, resetAt: now + windowMs });
				return next();
			}

			if (state.count >= max) {
				return error(message);
			}

			ctx.session.set(key, { ...state, count: state.count + 1 });
			return next();
		},
	};
}
