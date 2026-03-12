import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type {
	ResourceHandler,
	Store,
	TaskHandler,
	ToolHandler,
	ToolMiddleware,
} from "./types.js";

export interface InternalTool {
	name: string;
	description: string | undefined;
	input: unknown;
	handler: ToolHandler;
	middlewares: ToolMiddleware[];
	hiddenByMiddlewares: string[];
}

export interface InternalResource {
	uri: string;
	isTemplate: boolean;
	uriPattern: RegExp | null;
	name: string;
	description: string | undefined;
	mimeType: string | undefined;
	handler: ResourceHandler;
	middlewares: ToolMiddleware[];
	hiddenByMiddlewares: string[];
}

export interface InternalTask {
	name: string;
	description: string | undefined;
	input: unknown;
	handler: TaskHandler;
	middlewares: ToolMiddleware[];
	hiddenByMiddlewares: string[];
}

export interface SessionState {
	data: Map<string, unknown>;
	grants: Set<string>;
	toolOverrides: Map<string, "enabled" | "disabled">;
	resourceOverrides: Map<string, "enabled" | "disabled">;
}

export interface ServerState {
	store: Store;
	globalMiddlewares: ToolMiddleware[];
	tools: Map<string, InternalTool>;
	resources: Map<string, InternalResource>;
	tasks: Map<string, InternalTask>;
	sessions: Map<string, SessionState>;
	serverBySession: Map<string, Server>;
}

export interface ElicitationTracker {
	register(
		elicitationId: string,
		sessionId: string,
		sdkServer: Server,
	): Promise<void>;
	complete(elicitationId: string): void;
	cancel(elicitationId: string): void;
}
