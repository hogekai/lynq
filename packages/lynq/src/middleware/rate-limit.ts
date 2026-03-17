import { error } from "../response.js";
import { resolveUserId } from "../store.js";
import type { ToolMiddleware } from "../types.js";

export interface RateLimitOptions {
	/** Maximum calls per window. */
	max: number;
	/** Window duration in milliseconds. Default: 60000 (1 minute) */
	windowMs?: number;
	/** Error message. */
	message?: string;
	/**
	 * Use persistent Store for distributed rate limiting.
	 * Default: `false` (session-scoped — each session gets its own counter,
	 * so a client can bypass the limit by reconnecting).
	 * Set to `true` for production rate limiting across sessions.
	 *
	 * Rate limiting is atomic within a single process. For distributed
	 * stores (Redis, etc.), cross-process atomicity depends on the store
	 * implementation. Use a dedicated distributed rate limiter if strict
	 * cross-process limiting is required.
	 */
	store?: boolean;
	/**
	 * Scope rate limiting per user (implies `store: true`).
	 * Default: `false`.
	 *
	 * **Warning:** Users without `session.set("user", ...)` all share a single
	 * `"anon"` bucket. Ensure the user is set in session before rate-limited calls
	 * if per-user isolation is required.
	 */
	perUser?: boolean;
}

/**
 * Rate limiting middleware.
 *
 * **Default behavior is session-scoped** — each MCP session gets its own counter.
 * A client can bypass the limit by creating a new session (reconnecting).
 * For production use, set `store: true` to share counters across sessions,
 * or `perUser: true` to scope limits per authenticated user.
 */
export function rateLimit(options: RateLimitOptions): ToolMiddleware {
	const { max, windowMs = 60_000 } = options;
	const useStore = options.store === true || options.perUser === true;
	const perUser = options.perUser === true;
	const message =
		options.message ??
		`Rate limit exceeded. Max ${max} calls per ${windowMs / 1000}s.`;
	const ttlSeconds = Math.ceil(windowMs / 1000);

	// In-process mutex to prevent race conditions in the store-based path.
	// Multiple concurrent requests reading the same counter could all see
	// the same count and bypass the limit without this lock.
	const locks = new Map<string, Promise<void>>();

	async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
		while (locks.has(key)) await locks.get(key);
		let release!: () => void;
		locks.set(
			key,
			new Promise<void>((r) => {
				release = r;
			}),
		);
		try {
			return await fn();
		} finally {
			locks.delete(key);
			release();
		}
	}

	return {
		name: "rateLimit",
		async onCall(c, next) {
			const now = Date.now();

			if (useStore) {
				const prefix = perUser
					? `rateLimit:${resolveUserId(c.session) ?? "anon"}:${c.toolName}`
					: `rateLimit:${c.toolName}`;

				return withLock(prefix, async () => {
					const state = await c.store.get<{
						count: number;
						resetAt: number;
					}>(prefix);

					if (!state || now >= state.resetAt) {
						await c.store.set(
							prefix,
							{ count: 1, resetAt: now + windowMs },
							ttlSeconds,
						);
						return next();
					}

					if (state.count >= max) {
						return error(message);
					}

					await c.store.set(
						prefix,
						{ ...state, count: state.count + 1 },
						ttlSeconds,
					);
					return next();
				});
			}

			// Session-scoped (original behavior)
			const key = `rateLimit:${c.toolName}`;
			const state = c.session.get<{ count: number; resetAt: number }>(key);

			if (!state || now >= state.resetAt) {
				c.session.set(key, { count: 1, resetAt: now + windowMs });
				return next();
			}

			if (state.count >= max) {
				return error(message);
			}

			c.session.set(key, { ...state, count: state.count + 1 });
			return next();
		},
	};
}
