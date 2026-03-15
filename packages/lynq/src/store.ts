import type { Session, Store, UserStore } from "./types.js";

export interface MemoryStoreOptions {
	/** Maximum number of entries. When exceeded, expired entries are swept first, then least-recently-accessed entries are evicted. Default: 10000. */
	maxEntries?: number;
}

export function memoryStore(options?: MemoryStoreOptions): Store {
	const maxEntries = options?.maxEntries ?? 10_000;
	const data = new Map<
		string,
		{ value: unknown; expiresAt: number | undefined; accessedAt: number }
	>();

	return {
		async get<T = unknown>(key: string): Promise<T | undefined> {
			const entry = data.get(key);
			if (!entry) return undefined;
			if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
				data.delete(key);
				return undefined;
			}
			entry.accessedAt = Date.now();
			return entry.value as T;
		},
		async set(key: string, value: unknown, ttl?: number): Promise<void> {
			if (data.size >= maxEntries) {
				const now = Date.now();
				// Sweep expired entries first
				for (const [k, v] of data) {
					if (v.expiresAt !== undefined && now > v.expiresAt) data.delete(k);
				}
				// LRU eviction if still at capacity
				if (data.size >= maxEntries) {
					let oldestKey: string | undefined;
					let oldestTime = Number.POSITIVE_INFINITY;
					for (const [k, v] of data) {
						if (v.accessedAt < oldestTime) {
							oldestTime = v.accessedAt;
							oldestKey = k;
						}
					}
					if (oldestKey !== undefined) data.delete(oldestKey);
				}
			}
			data.set(key, {
				value,
				expiresAt: ttl !== undefined ? Date.now() + ttl * 1000 : undefined,
				accessedAt: Date.now(),
			});
		},
		async delete(key: string): Promise<void> {
			data.delete(key);
		},
	};
}

export function resolveUserId(session: Session): string | undefined {
	const user = session.get("user");
	if (!user) return undefined;
	if (typeof user === "string") return user;
	if (typeof user === "object" && user !== null) {
		const obj = user as Record<string, unknown>;
		if (typeof obj.id === "string") return obj.id;
		if (typeof obj.id === "number") return String(obj.id);
		if (typeof obj.sub === "string") return obj.sub;
	}
	return undefined;
}

export function createUserStore(session: Session, store: Store): UserStore {
	const getUserId = (): string => {
		const id = resolveUserId(session);
		if (!id) {
			const user = session.get("user");
			if (user) {
				const repr =
					typeof user === "object" ? JSON.stringify(user) : typeof user;
				throw new Error(
					`userStore: session has a "user" but could not resolve an ID. Expected: string | { id: string | number } | { sub: string }. Got: ${repr}`,
				);
			}
			throw new Error(
				"userStore requires a user in session. Call session.set('user', ...) first.",
			);
		}
		return id;
	};

	return {
		async get<T = unknown>(key: string): Promise<T | undefined> {
			return store.get<T>(`user:${getUserId()}:${key}`);
		},
		async set(key: string, value: unknown, ttl?: number): Promise<void> {
			await store.set(`user:${getUserId()}:${key}`, value, ttl);
		},
		async delete(key: string): Promise<void> {
			await store.delete(`user:${getUserId()}:${key}`);
		},
	};
}
