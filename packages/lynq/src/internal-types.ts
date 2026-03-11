import type {
	ResourceHandler,
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
