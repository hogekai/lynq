import type {
	CallToolResult,
	CreateMessageRequestParamsBase,
	CreateMessageResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import type { ToolResponse } from "./response.js";

// === Server Info ===

export interface ServerInfo {
	name: string;
	version: string;
}

// === Store ===

export interface Store {
	get<T = unknown>(key: string): Promise<T | undefined>;
	set(key: string, value: unknown, ttl?: number): Promise<void>;
	delete(key: string): Promise<void>;
}

export type UserStore = Store;

/** Accepted user shapes for `session.set("user", ...)`. Resolved by `resolveUserId`. */
export type User = string | { id: string | number } | { sub: string };

export interface ServerOptions extends ServerInfo {
	store?: Store;
	/** Called when the server starts (after stdio connect or on first HTTP request). */
	onServerStart?: () => void | Promise<void>;
	/** Called when a new session is created. */
	onSessionCreate?: (sessionId: string) => void | Promise<void>;
	/** Called when a session is destroyed (HTTP session close or transport disconnect). Session data is provided for cleanup (e.g. resolving user ID to delete store entries). */
	onSessionDestroy?: (
		sessionId: string,
		data: ReadonlyMap<string, unknown>,
	) => void | Promise<void>;
}

// === Session ===

export interface Session {
	/** Get a session-scoped value. */
	get<T = unknown>(key: string): T | undefined;
	/** Set a session-scoped value. */
	set(key: string, value: unknown): void;
	/** Authorize a middleware by name, enabling all tools and resources guarded by it. */
	authorize(middlewareName: string): void;
	/** Revoke a middleware authorization, disabling all tools and resources guarded by it. */
	revoke(middlewareName: string): void;
	/** Enable specific tools by name. */
	enableTools(...names: string[]): void;
	/** Disable specific tools by name. */
	disableTools(...names: string[]): void;
	/** Enable specific resources by URI. */
	enableResources(...uris: string[]): void;
	/** Disable specific resources by URI. */
	disableResources(...uris: string[]): void;
}

// === Elicitation ===

export interface ElicitFormResult<
	T = Record<string, string | number | boolean | string[]>,
> {
	action: "accept" | "decline" | "cancel";
	content: T;
}

export interface ElicitUrlResult {
	action: "accept" | "decline" | "cancel";
}

export interface ElicitUrlOptions {
	/** Pre-generated elicitation ID. If omitted, a random UUID is used. */
	elicitationId?: string;
	/** If true, wait for completeElicitation() before resolving. Default: false. */
	waitForCompletion?: boolean;
	/** Timeout in ms for waiting. Default: 300000 (5 minutes). */
	timeout?: number;
}

export interface Elicit {
	/** Request structured data from the user via a form. */
	form<T extends z.ZodObject<z.ZodRawShape>>(
		message: string,
		schema: T,
	): Promise<ElicitFormResult<z.infer<T>>>;
	/** Direct the user to an external URL. */
	url(
		message: string,
		url: string,
		options?: ElicitUrlOptions,
	): Promise<ElicitUrlResult>;
}

// === Sampling ===

export interface SampleOptions {
	maxTokens?: number;
	/** Model hint — the client makes the final decision. */
	model?: string;
	system?: string;
	temperature?: number;
	stopSequences?: string[];
}

export type SampleRawParams = CreateMessageRequestParamsBase;
export type SampleRawResult = CreateMessageResult;

export interface Sample {
	/** Send text, get text back. */
	(prompt: string, options?: SampleOptions): Promise<string>;
	/** Full SDK createMessage params and result. */
	raw(params: SampleRawParams): Promise<SampleRawResult>;
}

export interface RootInfo {
	/** The root URI. Currently always `file://`. */
	uri: string;
	/** Optional human-readable name for the root. */
	name?: string;
}

// === Context ===

export interface ToolContext {
	/** The name of the tool being called. */
	toolName: string;
	/** The arguments passed to the tool. */
	args: Record<string, unknown>;
	/** Session-scoped state and visibility control. */
	session: Session;
	/** Abort signal from the client. */
	signal: AbortSignal;
	/** Session ID. */
	sessionId: string;
	/** Request information from the user. */
	elicit: Elicit;
	/** Query client-provided filesystem roots. */
	roots: () => Promise<RootInfo[]>;
	/** Request LLM inference from the client. */
	sample: Sample;
	/** Create a text response. Chainable. */
	text(value: string): ToolResponse;
	/** Create a JSON response. Chainable. */
	json(value: unknown): ToolResponse;
	/** Create an error response. Chainable. */
	error(message: string): ToolResponse;
	/** Create an image response. Chainable. */
	image(data: string, mimeType: string): ToolResponse;
	/** Persistent key-value store (global scope). */
	store: Store;
	/** Persistent key-value store (user scope, keyed by session user ID). */
	userStore: UserStore;
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
	/** Called when a tool is invoked. Must call and return `await next()` to continue the chain.
	 *  Calling next() without returning its result is undefined behavior. */
	onCall?(
		c: ToolContext,
		next: () => Promise<CallToolResult>,
	): Promise<CallToolResult>;
	/** Called after the handler returns. Runs in reverse middleware order. */
	onResult?(
		result: CallToolResult,
		c: ToolContext,
	): CallToolResult | Promise<CallToolResult>;
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
	c: ToolContext,
) => CallToolResult | Promise<CallToolResult>;

// === Task (@experimental) ===

/** @experimental Running tasks are fire-and-forget — no graceful shutdown guarantee. */
export interface TaskConfig<TInput = unknown> {
	description?: string;
	input?: TInput;
}

/** @experimental */
export interface TaskControl {
	/** Report progress. percentage: 0-100. message: optional status text. */
	progress(percentage: number, message?: string): void;
	/** True when the client has cancelled this task. */
	readonly cancelled: boolean;
}

/** @experimental */
export interface TaskContext extends ToolContext {
	task: TaskControl;
}

/** @experimental */
export type TaskHandler<TInput = unknown> = (
	args: InferInput<TInput>,
	c: TaskContext,
) => CallToolResult | Promise<CallToolResult>;

// === Resource ===

export interface ResourceConfig {
	name: string;
	description?: string;
	mimeType?: string;
}

export interface ResourceContent {
	text?: string;
	blob?: string;
	mimeType?: string;
}

export interface ResourceContext {
	uri: string;
	session: Session;
	sessionId: string;
	/** Query client-provided filesystem roots. */
	roots: () => Promise<RootInfo[]>;
	/** Persistent key-value store (global scope). */
	store: Store;
	/** Persistent key-value store (user scope, keyed by session user ID). */
	userStore: UserStore;
}

export type ResourceHandler = (
	uri: string,
	c: ResourceContext,
) => ResourceContent | Promise<ResourceContent>;

// === HTTP Adapter ===

/**
 * Options for the HTTP adapter returned by `server.http()`.
 *
 * **Security note:** Session routing relies on the `Mcp-Session-Id` header.
 * Session IDs are UUIDs (hard to guess) but can leak via logs or proxies.
 * Use `onRequest` to add additional validation (e.g., Bearer token check,
 * IP binding) or `sessionIdGenerator` to produce HMAC-signed session tokens.
 */
export interface HttpAdapterOptions {
	/** Disable session management. Default: false. */
	sessionless?: boolean;
	/**
	 * Custom session ID generator. Default: `crypto.randomUUID()`.
	 * Can be used to produce HMAC-signed session tokens for additional security.
	 */
	sessionIdGenerator?: () => string;
	/** Return JSON instead of SSE streams. Default: false. */
	enableJsonResponse?: boolean;
	/**
	 * Called on each HTTP request after session is resolved.
	 * Use to inject HTTP headers (e.g., Bearer tokens) into MCP sessions,
	 * or to validate that the requester owns the session (e.g., IP binding, token check).
	 */
	onRequest?: (
		req: Request,
		sessionId: string,
		session: Session,
	) => void | Promise<void>;
}

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

	/** Register a resource with config and handler. */
	resource(uri: string, config: ResourceConfig, handler: ResourceHandler): void;

	/** Register a resource with per-resource middlewares, config, and handler. */
	resource(
		uri: string,
		...args: [...ToolMiddleware[], ResourceConfig, ResourceHandler]
	): void;

	/** @experimental Register a task with config and handler. */
	task<TInput>(
		name: string,
		config: TaskConfig<TInput>,
		handler: TaskHandler<TInput>,
	): void;

	/** @experimental Register a task with per-task middlewares, config, and handler. */
	task<TInput>(
		name: string,
		...args: [...ToolMiddleware[], TaskConfig<TInput>, TaskHandler<TInput>]
	): void;

	/** Start stdio transport. */
	stdio(): Promise<void>;

	/** Start HTTP transport. Returns a Web Standard request handler. */
	http(options?: HttpAdapterOptions): (req: Request) => Promise<Response>;

	/** Access a session by ID (for external HTTP callback routes). Stateful mode only. */
	session(sessionId: string): Session;

	/** Complete a pending URL elicitation (called from external HTTP callback). */
	completeElicitation(elicitationId: string): void;

	/** The persistent store instance. */
	store: Store;

	/** @experimental Wait for all running tasks to settle. For graceful shutdown. */
	drain(): Promise<void>;
}
