import type { Session, Store, UserStore } from "./types.js";

export function memoryStore(): Store {
	const data = new Map<
		string,
		{ value: unknown; expiresAt: number | undefined }
	>();

	return {
		async get<T = unknown>(key: string): Promise<T | undefined> {
			const entry = data.get(key);
			if (!entry) return undefined;
			if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
				data.delete(key);
				return undefined;
			}
			return entry.value as T;
		},
		async set(key: string, value: unknown, ttl?: number): Promise<void> {
			data.set(key, {
				value,
				expiresAt: ttl !== undefined ? Date.now() + ttl * 1000 : undefined,
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
