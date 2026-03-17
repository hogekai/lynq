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
	lastActivityAt: number;
}

export interface ServerState {
	store: Store;
	sessionTTL: number;
	globalMiddlewares: ToolMiddleware[];
	tools: Map<string, InternalTool>;
	resources: Map<string, InternalResource>;
	tasks: Map<string, InternalTask>;
	sessions: Map<string, SessionState>;
	serverBySession: Map<string, Server>;
	onServerStart: (() => void | Promise<void>) | undefined;
	onSessionCreate: ((sessionId: string) => void | Promise<void>) | undefined;
	onSessionDestroy:
		| ((
				sessionId: string,
				data: ReadonlyMap<string, unknown>,
		  ) => void | Promise<void>)
		| undefined;
	onError:
		| ((
				error: unknown,
				context: { source: string; sessionId?: string },
		  ) => void)
		| undefined;
	runningTasks: Set<Promise<void>>;
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
