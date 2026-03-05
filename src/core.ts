import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "./schema.js";
import type {
	MCPServer,
	Session,
	ToolContext,
	ToolHandler,
	ToolMiddleware,
} from "./types.js";

import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";

// === Internal Types ===

interface InternalTool {
	name: string;
	description: string | undefined;
	schema: z.ZodRawShape;
	handler: ToolHandler;
	middlewares: ToolMiddleware[];
}

interface SessionState {
	data: Map<string, unknown>;
	authorizedMiddlewares: Set<string>;
	disabledTools: Set<string>;
	enabledOverrides: Set<string>;
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
				authorizedMiddlewares: new Set(),
				disabledTools: new Set(),
				enabledOverrides: new Set(),
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
				state.authorizedMiddlewares.add(middlewareName);
				notifyToolListChanged();
			},
			revoke(middlewareName: string): void {
				state.authorizedMiddlewares.delete(middlewareName);
				notifyToolListChanged();
			},
			enableTools(...names: string[]): void {
				for (const name of names) {
					state.enabledOverrides.add(name);
					state.disabledTools.delete(name);
				}
				notifyToolListChanged();
			},
			disableTools(...names: string[]): void {
				for (const name of names) {
					state.disabledTools.add(name);
					state.enabledOverrides.delete(name);
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

		if (state.disabledTools.has(tool.name)) return false;
		if (state.enabledOverrides.has(tool.name)) return true;

		for (const mw of tool.middlewares) {
			if (mw.onRegister) {
				const result = mw.onRegister({
					name: tool.name,
					description: tool.description,
					middlewares: tool.middlewares,
				});
				if (result === false) {
					if (!state.authorizedMiddlewares.has(mw.name)) {
						return false;
					}
				}
			}
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
					inputSchema: zodToJsonSchema(tool.schema),
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
		let description: string | undefined;

		// Parse overloaded arguments
		let rest = args.slice(1);

		// Optional description
		if (typeof rest[0] === "string") {
			description = rest[0] as string;
			rest = rest.slice(1);
		}

		// Handler is always last, schema is second-to-last
		const handler = rest[rest.length - 1] as ToolHandler;
		const schema = rest[rest.length - 2] as z.ZodRawShape;

		// Everything before schema is per-tool middleware
		const middlewares = rest.slice(0, -2) as ToolMiddleware[];

		// Combine global + per-tool middlewares
		const allMiddlewares = [...globalMiddlewares, ...middlewares];

		const internalTool: InternalTool = {
			name,
			description,
			schema,
			handler,
			middlewares: allMiddlewares,
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
