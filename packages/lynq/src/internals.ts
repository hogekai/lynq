import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { SessionState } from "./internal-types.js";
import type { MCPServer, Session } from "./types.js";

export interface InternalAccess {
	server: Server;
	getSession(sessionId: string): SessionState;
	isToolVisible(toolName: string, sessionId: string): boolean;
	isResourceVisible(uri: string, sessionId: string): boolean;
	isTaskVisible(taskName: string, sessionId: string): boolean;
	createSessionAPI(sessionId: string): Session;
}

const internalsMap = new WeakMap<MCPServer, InternalAccess>();

export function registerInternals(
	server: MCPServer,
	internals: InternalAccess,
): void {
	internalsMap.set(server, internals);
}

export function getInternals(server: MCPServer): InternalAccess {
	const internals = internalsMap.get(server);
	if (!internals)
		throw new Error("No internals registered for this server instance");
	return internals;
}
