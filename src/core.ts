import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
	type ZodRawShapeCompat,
	normalizeObjectSchema,
} from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type {
	MCPServer,
	Session,
	ToolConfig,
	ToolContext,
	ToolHandler,
	ToolInfo,
	ToolMiddleware,
} from "./types.js";

import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// === Internal Types ===

interface InternalTool {
	name: string;
	description: string | undefined;
	input: unknown;
	handler: ToolHandler;
	middlewares: ToolMiddleware[];
	hiddenByMiddlewares: string[];
}

interface SessionState {
	data: Map<string, unknown>;
	grants: Set<string>;
	toolOverrides: Map<string, "enabled" | "disabled">;
}

// === Helpers ===

function inputToJsonSchema(input: unknown): Record<string, unknown> {
	if (input == null) return { type: "object" };
	const normalized = normalizeObjectSchema(input as ZodRawShapeCompat);
	return normalized
		? (toJsonSchemaCompat(normalized) as Record<string, unknown>)
		: (input as Record<string, unknown>);
}

// === createMCPServer ===

export function createMCPServer(info: {
	name: string;
	version: string;
}): MCPServer {
	const globalMiddlewares: ToolMiddleware[] = [];
	const tools = new Map<string, InternalTool>();
	const sessions = new Map<string, SessionState>();

	const server = new Server(info, {
		capabilities: { tools: { listChanged: true } },
	});

	function getSession(sessionId: string): SessionState {
		let session = sessions.get(sessionId);
		if (!session) {
			session = {
				data: new Map(),
				grants: new Set(),
				toolOverrides: new Map(),
			};
			sessions.set(sessionId, session);
		}
		return session;
	}

	function createSessionAPI(sessionId: string): Session {
		const state = getSession(sessionId);

		return {
			get<T = unknown>(key: string): T | undefined {
				return state.data.get(key) as T | undefined;
			},
			set(key: string, value: unknown): void {
				state.data.set(key, value);
			},
			authorize(middlewareName: string): void {
				state.grants.add(middlewareName);
				notifyToolListChanged();
			},
			revoke(middlewareName: string): void {
				state.grants.delete(middlewareName);
				notifyToolListChanged();
			},
			enableTools(...names: string[]): void {
				for (const name of names) {
					state.toolOverrides.set(name, "enabled");
				}
				notifyToolListChanged();
			},
			disableTools(...names: string[]): void {
				for (const name of names) {
					state.toolOverrides.set(name, "disabled");
				}
				notifyToolListChanged();
			},
		};
	}

	function notifyToolListChanged(): void {
		server.sendToolListChanged().catch(() => {});
	}

	function isToolVisible(tool: InternalTool, sessionId: string): boolean {
		const state = getSession(sessionId);

		const override = state.toolOverrides.get(tool.name);
		if (override === "disabled") return false;
		if (override === "enabled") return true;

		for (const mwName of tool.hiddenByMiddlewares) {
			if (!state.grants.has(mwName)) return false;
		}

		return true;
	}

	function buildMiddlewareChain(
		middlewares: ToolMiddleware[],
		ctx: ToolContext,
		finalHandler: () => Promise<CallToolResult>,
	): () => Promise<CallToolResult> {
		const callMiddlewares = middlewares.filter((mw) => mw.onCall);
		let index = 0;

		const next = (): Promise<CallToolResult> => {
			if (index >= callMiddlewares.length) {
				return finalHandler();
			}
			const mw = callMiddlewares[index++];
			// biome-ignore lint/style/noNonNullAssertion: filtered above to only include middlewares with onCall
			return mw.onCall!(ctx, next);
		};

		return next;
	}

	// --- Request handlers ---

	server.setRequestHandler(ListToolsRequestSchema, (_request, extra) => {
		const sessionId = extra.sessionId ?? "default";
		const visibleTools = [];

		for (const tool of tools.values()) {
			if (isToolVisible(tool, sessionId)) {
				visibleTools.push({
					name: tool.name,
					description: tool.description,
					inputSchema: inputToJsonSchema(tool.input),
				});
			}
		}

		return { tools: visibleTools };
	});

	server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
		const { name, arguments: args } = request.params;
		const tool = tools.get(name);

		if (!tool) {
			return {
				content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
				isError: true,
			};
		}

		const sessionId = extra.sessionId ?? "default";

		if (!isToolVisible(tool, sessionId)) {
			return {
				content: [
					{
						type: "text" as const,
						text: `Tool not available: ${name}`,
					},
				],
				isError: true,
			};
		}

		const ctx: ToolContext = {
			toolName: name,
			session: createSessionAPI(sessionId),
			signal: extra.signal,
			sessionId,
		};

		const finalHandler = () => Promise.resolve(tool.handler(args ?? {}, ctx));

		const chain = buildMiddlewareChain(tool.middlewares, ctx, finalHandler);

		return chain();
	});

	// --- Public API ---

	function use(middleware: ToolMiddleware): void {
		globalMiddlewares.push(middleware);
	}

	function tool(...args: unknown[]): void {
		const name = args[0] as string;
		const rest = args.slice(1);

		// Handler is always last
		const handler = rest[rest.length - 1];
		if (typeof handler !== "function") {
			throw new TypeError(
				`tool("${name}"): last argument must be a handler function`,
			);
		}

		// Config is second-to-last
		const config = rest[rest.length - 2];
		if (
			config == null ||
			typeof config !== "object" ||
			Array.isArray(config) ||
			typeof (config as Record<string, unknown>).name === "string"
		) {
			throw new TypeError(
				`tool("${name}"): second-to-last argument must be a config object`,
			);
		}

		// Everything between name and config is per-tool middleware
		const perToolMiddlewares = rest.slice(0, -2);
		for (const mw of perToolMiddlewares) {
			if (
				!mw ||
				typeof mw !== "object" ||
				typeof (mw as Record<string, unknown>).name !== "string"
			) {
				throw new TypeError(
					`tool("${name}"): each middleware must have a "name" property`,
				);
			}
		}

		const toolConfig = config as ToolConfig;
		const middlewares = perToolMiddlewares as ToolMiddleware[];
		const allMiddlewares = [...globalMiddlewares, ...middlewares];

		// Cache onRegister results at registration time
		const toolInfo: ToolInfo = {
			name,
			description: toolConfig.description,
			middlewares: allMiddlewares,
		};

		const hiddenByMiddlewares: string[] = [];
		for (const mw of allMiddlewares) {
			if (mw.onRegister?.(toolInfo) === false) {
				hiddenByMiddlewares.push(mw.name);
			}
		}

		const internalTool: InternalTool = {
			name,
			description: toolConfig.description,
			input: toolConfig.input,
			handler: handler as ToolHandler,
			middlewares: allMiddlewares,
			hiddenByMiddlewares,
		};

		tools.set(name, internalTool);
	}

	async function stdio(): Promise<void> {
		const { StdioServerTransport } = await import(
			"@modelcontextprotocol/sdk/server/stdio.js"
		);
		const transport = new StdioServerTransport();
		await server.connect(transport);
	}

	async function connect(transport: Transport): Promise<void> {
		await server.connect(transport);
	}

	return {
		use,
		tool: tool as MCPServer["tool"],
		stdio,
		connect,
		/** @internal Exposed for testing. */
		_server: server,
		_getSession: getSession,
		_isToolVisible(toolName: string, sessionId: string): boolean {
			const t = tools.get(toolName);
			if (!t) return false;
			return isToolVisible(t, sessionId);
		},
		_createSessionAPI: createSessionAPI,
	} as MCPServer & {
		connect(transport: Transport): Promise<void>;
		_server: Server;
		_getSession(sessionId: string): SessionState;
		_isToolVisible(toolName: string, sessionId: string): boolean;
		_createSessionAPI(sessionId: string): Session;
	};
}
