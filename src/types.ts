import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";

// === Server Info ===

export interface ServerInfo {
	name: string;
	version: string;
}

// === Session ===

export interface Session {
	/** Get a session-scoped value. */
	get<T = unknown>(key: string): T | undefined;
	/** Set a session-scoped value. */
	set(key: string, value: unknown): void;
	/** Authorize a middleware by name, enabling all tools guarded by it. */
	authorize(middlewareName: string): void;
	/** Revoke a middleware authorization, disabling all tools guarded by it. */
	revoke(middlewareName: string): void;
	/** Enable specific tools by name. */
	enableTools(...names: string[]): void;
	/** Disable specific tools by name. */
	disableTools(...names: string[]): void;
}

// === Context ===

export interface ToolContext {
	/** The name of the tool being called. */
	toolName: string;
	/** Session-scoped state and visibility control. */
	session: Session;
	/** Abort signal from the client. */
	signal: AbortSignal;
	/** Session ID. */
	sessionId: string;
}

// === Middleware ===

export interface ToolInfo {
	name: string;
	description?: string | undefined;
	middlewares: readonly ToolMiddleware[];
}

export interface ToolMiddleware {
	/** Unique name for this middleware instance. Used for authorize()/revoke(). */
	name: string;
	/** Called when a tool is registered. Return false to hide the tool initially. */
	onRegister?(tool: ToolInfo): boolean | undefined;
	/** Called when a tool is invoked. Must call next() to continue the chain. */
	onCall?(
		ctx: ToolContext,
		next: () => Promise<CallToolResult>,
	): Promise<CallToolResult>;
}

// === Tool ===

type InferInput<T> = T extends z.ZodTypeAny
	? z.output<T>
	: Record<string, unknown>;

export interface ToolConfig<TInput = unknown> {
	description?: string;
	input?: TInput;
}

export type ToolHandler<TInput = unknown> = (
	args: InferInput<TInput>,
	ctx: ToolContext,
) => CallToolResult | Promise<CallToolResult>;

// === Server ===

export interface MCPServer {
	/** Register a global middleware applied to all subsequently registered tools. */
	use(middleware: ToolMiddleware): void;

	/** Register a tool with config and handler. */
	tool<TInput>(
		name: string,
		config: ToolConfig<TInput>,
		handler: ToolHandler<TInput>,
	): void;

	/** Register a tool with per-tool middlewares, config, and handler. */
	tool<TInput>(
		name: string,
		...args: [...ToolMiddleware[], ToolConfig<TInput>, ToolHandler<TInput>]
	): void;

	/** Start stdio transport. */
	stdio(): Promise<void>;
}
