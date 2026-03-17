import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { isVisible } from "./helpers.js";
import type {
	InternalResource,
	InternalTask,
	InternalTool,
	ServerState,
	SessionState,
} from "./internal-types.js";
import type { Session } from "./types.js";

export function swallowError(
	state: ServerState,
	source: string,
	sessionId?: string,
): (err: unknown) => void {
	return (err: unknown) => {
		state.onError?.(err, sessionId ? { source, sessionId } : { source });
	};
}

// ── Session Persistence ─────────────────────────────────────────────────

interface SerializedSessionState {
	data: Record<string, unknown>;
	grants: string[];
	toolOverrides: Record<string, "enabled" | "disabled">;
	resourceOverrides: Record<string, "enabled" | "disabled">;
}

function serializeSession(session: SessionState): SerializedSessionState {
	return {
		data: Object.fromEntries(session.data),
		grants: Array.from(session.grants),
		toolOverrides: Object.fromEntries(session.toolOverrides),
		resourceOverrides: Object.fromEntries(session.resourceOverrides),
	};
}

function deserializeSession(
	s: SerializedSessionState,
): Omit<SessionState, "lastActivityAt"> {
	return {
		data: new Map(Object.entries(s.data)),
		grants: new Set(s.grants),
		toolOverrides: new Map(
			Object.entries(s.toolOverrides),
		) as SessionState["toolOverrides"],
		resourceOverrides: new Map(
			Object.entries(s.resourceOverrides),
		) as SessionState["resourceOverrides"],
	};
}

export function persistSession(state: ServerState, sessionId: string): void {
	if (!state.sessionPersistence) return;
	const session = state.sessions.get(sessionId);
	if (!session) return;

	const doWrite = () => {
		const key = `session:${sessionId}`;
		const serialized = serializeSession(session);
		state.store
			.set(key, serialized, state.sessionPersistence?.ttl)
			.catch(swallowError(state, "sessionPersist", sessionId));
	};

	const interval = state.sessionPersistence.syncInterval;
	if (interval <= 0) {
		doWrite();
		return;
	}

	// Debounce
	const existing = state.persistTimers.get(sessionId);
	if (existing) clearTimeout(existing);
	state.persistTimers.set(
		sessionId,
		setTimeout(() => {
			state.persistTimers.delete(sessionId);
			doWrite();
		}, interval * 1000),
	);
}

function cancelPersistTimer(state: ServerState, sessionId: string): void {
	const timer = state.persistTimers.get(sessionId);
	if (timer) {
		clearTimeout(timer);
		state.persistTimers.delete(sessionId);
	}
}

export async function restoreSession(
	state: ServerState,
	sessionId: string,
): Promise<boolean> {
	if (!state.sessionPersistence) return false;
	const key = `session:${sessionId}`;
	const stored = await state.store.get<SerializedSessionState>(key);
	if (!stored) return false;

	const session = state.sessions.get(sessionId);
	if (!session) return false;

	const restored = deserializeSession(stored);
	session.data = restored.data;
	session.grants = restored.grants;
	session.toolOverrides = restored.toolOverrides;
	session.resourceOverrides = restored.resourceOverrides;
	return true;
}

// ── Session Lifecycle ───────────────────────────────────────────────────

function isSessionExpired(state: ServerState, session: SessionState): boolean {
	return (
		state.sessionTTL > 0 &&
		Date.now() - session.lastActivityAt > state.sessionTTL * 1000
	);
}

function destroySession(
	state: ServerState,
	sessionId: string,
	session: SessionState,
): void {
	cancelPersistTimer(state, sessionId);
	state.sessions.delete(sessionId);
	state.serverBySession.delete(sessionId);
	if (state.sessionPersistence) {
		state.store
			.delete(`session:${sessionId}`)
			.catch(swallowError(state, "sessionDelete", sessionId));
	}
	if (state.onSessionDestroy) {
		try {
			Promise.resolve(state.onSessionDestroy(sessionId, session.data)).catch(
				swallowError(state, "onSessionDestroy", sessionId),
			);
		} catch (err) {
			state.onError?.(err, { source: "onSessionDestroy", sessionId });
		}
	}
}

export function getSession(
	state: ServerState,
	sessionId: string,
): SessionState {
	let session = state.sessions.get(sessionId);

	// Lazy TTL check: expire stale sessions on access
	if (session && isSessionExpired(state, session)) {
		destroySession(state, sessionId, session);
		session = undefined;
	}

	if (!session) {
		session = {
			data: new Map(),
			grants: new Set(),
			toolOverrides: new Map(),
			resourceOverrides: new Map(),
			lastActivityAt: Date.now(),
		};
		state.sessions.set(sessionId, session);
		if (state.onSessionCreate) {
			try {
				Promise.resolve(state.onSessionCreate(sessionId)).catch(
					swallowError(state, "onSessionCreate", sessionId),
				);
			} catch (err) {
				state.onError?.(err, { source: "onSessionCreate", sessionId });
			}
		}
	} else {
		session.lastActivityAt = Date.now();
	}
	return session;
}

/**
 * Remove sessions that have been inactive longer than `state.sessionTTL`.
 * Called periodically from the HTTP adapter.
 */
export function sweepExpiredSessions(
	state: ServerState,
	httpSessions?: Map<string, unknown>,
): void {
	if (state.sessionTTL <= 0) return;
	const now = Date.now();
	const ttlMs = state.sessionTTL * 1000;
	for (const [sid, session] of state.sessions) {
		if (now - session.lastActivityAt > ttlMs) {
			httpSessions?.delete(sid);
			destroySession(state, sid, session);
		}
	}
}

// ── Visibility ──────────────────────────────────────────────────────────

export function isToolVisible(
	state: ServerState,
	tool: InternalTool,
	sessionId: string,
): boolean {
	const s = getSession(state, sessionId);
	return isVisible(
		tool.hiddenByMiddlewares,
		tool.name,
		s.toolOverrides,
		s.grants,
	);
}

export function isResourceVisible(
	state: ServerState,
	res: InternalResource,
	sessionId: string,
): boolean {
	const s = getSession(state, sessionId);
	return isVisible(
		res.hiddenByMiddlewares,
		res.uri,
		s.resourceOverrides,
		s.grants,
	);
}

export function isTaskVisible(
	state: ServerState,
	task: InternalTask,
	sessionId: string,
): boolean {
	const s = getSession(state, sessionId);
	return isVisible(
		task.hiddenByMiddlewares,
		task.name,
		s.toolOverrides,
		s.grants,
	);
}

// ── Notifications ───────────────────────────────────────────────────────

export function notifyToolListChanged(
	state: ServerState,
	defaultServer: Server,
	sessionId?: string,
): void {
	const srv =
		(sessionId && state.serverBySession.get(sessionId)) || defaultServer;
	srv
		.sendToolListChanged()
		.catch(swallowError(state, "sendToolListChanged", sessionId));
}

export function notifyResourceListChanged(
	state: ServerState,
	defaultServer: Server,
	sessionId?: string,
): void {
	const srv =
		(sessionId && state.serverBySession.get(sessionId)) || defaultServer;
	srv
		.sendResourceListChanged()
		.catch(swallowError(state, "sendResourceListChanged", sessionId));
}

// ── Session API ─────────────────────────────────────────────────────────

export function createSessionAPI(
	state: ServerState,
	defaultServer: Server,
	sessionId: string,
): Session {
	const s = getSession(state, sessionId);

	return {
		get<T = unknown>(key: string): T | undefined {
			return s.data.get(key) as T | undefined;
		},
		set(key: string, value: unknown): void {
			s.data.set(key, value);
			persistSession(state, sessionId);
		},
		authorize(middlewareName: string): void {
			s.grants.add(middlewareName);
			persistSession(state, sessionId);
			notifyToolListChanged(state, defaultServer, sessionId);
			notifyResourceListChanged(state, defaultServer, sessionId);
		},
		revoke(middlewareName: string): void {
			s.grants.delete(middlewareName);
			persistSession(state, sessionId);
			notifyToolListChanged(state, defaultServer, sessionId);
			notifyResourceListChanged(state, defaultServer, sessionId);
		},
		enableTools(...names: string[]): void {
			for (const name of names) {
				s.toolOverrides.set(name, "enabled");
			}
			persistSession(state, sessionId);
			notifyToolListChanged(state, defaultServer, sessionId);
		},
		disableTools(...names: string[]): void {
			for (const name of names) {
				s.toolOverrides.set(name, "disabled");
			}
			persistSession(state, sessionId);
			notifyToolListChanged(state, defaultServer, sessionId);
		},
		enableResources(...uris: string[]): void {
			for (const uri of uris) {
				s.resourceOverrides.set(uri, "enabled");
			}
			persistSession(state, sessionId);
			notifyResourceListChanged(state, defaultServer, sessionId);
		},
		disableResources(...uris: string[]): void {
			for (const uri of uris) {
				s.resourceOverrides.set(uri, "disabled");
			}
			persistSession(state, sessionId);
			notifyResourceListChanged(state, defaultServer, sessionId);
		},
	};
}
