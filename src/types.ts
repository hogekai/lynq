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

export interface ToolMiddleware {
	/** Unique name for this middleware instance. Used for authorize()/revoke(). */
	name: string;
	/** Called when a tool is registered. Return false to hide the tool initially. */
	onRegister?(tool: RegisteredToolInfo): boolean | undefined;
	/** Called when a tool is invoked. Must call next() to continue the chain. */
	onCall?(
		ctx: ToolContext,
		next: () => Promise<CallToolResult>,
	): Promise<CallToolResult>;
}

// === Tool ===

export interface RegisteredToolInfo {
	name: string;
	description?: string | undefined;
	middlewares: readonly ToolMiddleware[];
}

export type ToolHandler<T extends z.ZodRawShape = z.ZodRawShape> = (
	args: z.objectOutputType<T, z.ZodTypeAny>,
	ctx: ToolContext,
) => CallToolResult | Promise<CallToolResult>;

// === Server ===

export interface MCPServer {
	/** Register a global middleware applied to all subsequently registered tools. */
	use(middleware: ToolMiddleware): void;

	/** Register a tool with schema and handler. */
	tool<T extends z.ZodRawShape>(
		name: string,
		schema: T,
		handler: ToolHandler<T>,
	): void;

	/** Register a tool with description, schema, and handler. */
	tool<T extends z.ZodRawShape>(
		name: string,
		description: string,
		schema: T,
		handler: ToolHandler<T>,
	): void;

	/** Register a tool with per-tool middlewares and schema. */
	tool<T extends z.ZodRawShape>(
		name: string,
		...args: [...ToolMiddleware[], T, ToolHandler<T>]
	): void;

	/** Register a tool with description, per-tool middlewares, and schema. */
	tool<T extends z.ZodRawShape>(
		name: string,
		description: string,
		...args: [...ToolMiddleware[], T, ToolHandler<T>]
	): void;

	/** Start stdio transport. */
	stdio(): Promise<void>;
}
