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
		state.onError?.(err, { source, sessionId });
	};
}

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
	state.sessions.delete(sessionId);
	state.serverBySession.delete(sessionId);
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
		},
		authorize(middlewareName: string): void {
			s.grants.add(middlewareName);
			notifyToolListChanged(state, defaultServer, sessionId);
			notifyResourceListChanged(state, defaultServer, sessionId);
		},
		revoke(middlewareName: string): void {
			s.grants.delete(middlewareName);
			notifyToolListChanged(state, defaultServer, sessionId);
			notifyResourceListChanged(state, defaultServer, sessionId);
		},
		enableTools(...names: string[]): void {
			for (const name of names) {
				s.toolOverrides.set(name, "enabled");
			}
			notifyToolListChanged(state, defaultServer, sessionId);
		},
		disableTools(...names: string[]): void {
			for (const name of names) {
				s.toolOverrides.set(name, "disabled");
			}
			notifyToolListChanged(state, defaultServer, sessionId);
		},
		enableResources(...uris: string[]): void {
			for (const uri of uris) {
				s.resourceOverrides.set(uri, "enabled");
			}
			notifyResourceListChanged(state, defaultServer, sessionId);
		},
		disableResources(...uris: string[]): void {
			for (const uri of uris) {
				s.resourceOverrides.set(uri, "disabled");
			}
			notifyResourceListChanged(state, defaultServer, sessionId);
		},
	};
}
