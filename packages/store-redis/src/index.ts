import type { Store } from "@lynq/lynq";

export interface RedisStoreOptions {
	/** ioredis client instance. */
	client: {
		get(key: string): Promise<string | null>;
		set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
		del(key: string): Promise<number>;
	};
	/** Key prefix. Default: "lynq:" */
	prefix?: string;
}

/**
 * Create a Redis-backed Store implementation.
 *
 * @example
 * ```ts
 * import Redis from "ioredis";
 * import { redisStore } from "@lynq/store-redis";
 *
 * const store = redisStore({ client: new Redis() });
 * const server = createMCPServer({ name: "my-server", version: "1.0.0", store });
 * ```
 */
export function redisStore(options: RedisStoreOptions): Store {
	const { client, prefix = "lynq:" } = options;

	return {
		async get<T = unknown>(key: string): Promise<T | undefined> {
			const raw = await client.get(`${prefix}${key}`);
			if (raw === null) return undefined;
			try {
				return JSON.parse(raw) as T;
			} catch {
				return raw as T;
			}
		},

		async set(key: string, value: unknown, ttl?: number): Promise<void> {
			const serialized = JSON.stringify(value);
			if (ttl !== undefined && ttl > 0) {
				await client.set(`${prefix}${key}`, serialized, "EX", ttl);
			} else {
				await client.set(`${prefix}${key}`, serialized);
			}
		},

		async delete(key: string): Promise<void> {
			await client.del(`${prefix}${key}`);
		},
	};
}
