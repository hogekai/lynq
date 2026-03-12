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

export function getSession(
	state: ServerState,
	sessionId: string,
): SessionState {
	let session = state.sessions.get(sessionId);
	if (!session) {
		session = {
			data: new Map(),
			grants: new Set(),
			toolOverrides: new Map(),
			resourceOverrides: new Map(),
		};
		state.sessions.set(sessionId, session);
		if (state.onSessionCreate) {
			try {
				Promise.resolve(state.onSessionCreate(sessionId)).catch(() => {});
			} catch {
				// fire-and-forget — sync throws are silently caught
			}
		}
	}
	return session;
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
	srv.sendToolListChanged().catch(() => {});
}

export function notifyResourceListChanged(
	state: ServerState,
	defaultServer: Server,
	sessionId?: string,
): void {
	const srv =
		(sessionId && state.serverBySession.get(sessionId)) || defaultServer;
	srv.sendResourceListChanged().catch(() => {});
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
