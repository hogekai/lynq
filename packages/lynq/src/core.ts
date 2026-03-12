import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { createElicitationTracker } from "./elicitation.js";
import { createTaskStore, setupHandlers } from "./handlers.js";
import {
	buildTemplatePattern,
	cacheHiddenMiddlewares,
	parseMiddlewareArgs,
} from "./helpers.js";
import { createHttpAdapter } from "./http.js";
import type {
	InternalResource,
	InternalTask,
	InternalTool,
	ServerState,
	SessionState,
} from "./internal-types.js";
import {
	createSessionAPI,
	getSession,
	isResourceVisible,
	isTaskVisible,
	isToolVisible,
} from "./session.js";
import { memoryStore } from "./store.js";
import type {
	MCPServer,
	ResourceConfig,
	ResourceHandler,
	ServerOptions,
	Session,
	TaskConfig,
	TaskHandler,
	ToolConfig,
	ToolHandler,
	ToolInfo,
	ToolMiddleware,
} from "./types.js";

// === createMCPServer ===

export function createMCPServer(info: ServerOptions): MCPServer {
	const state: ServerState = {
		store: info.store ?? memoryStore(),
		globalMiddlewares: [],
		tools: new Map<string, InternalTool>(),
		resources: new Map<string, InternalResource>(),
		tasks: new Map<string, InternalTask>(),
		sessions: new Map<string, SessionState>(),
		serverBySession: new Map<string, Server>(),
		onServerStart: info.onServerStart,
		onSessionCreate: info.onSessionCreate,
		onSessionDestroy: info.onSessionDestroy,
	};

	const elicitation = createElicitationTracker();
	const { taskStore, cancelledTaskIds } = createTaskStore();

	const server = new Server(info, {
		capabilities: {
			tools: { listChanged: true },
			resources: { listChanged: true },
			tasks: { list: {}, cancel: {}, requests: { tools: { call: {} } } },
		},
		taskStore,
	});

	setupHandlers(server, state, server, elicitation, cancelledTaskIds);

	server.onclose = () => {
		// For non-HTTP transports (stdio, InMemory), clean up the default session
		const sessionId = "default";
		state.sessions.delete(sessionId);
		if (state.onSessionDestroy) {
			try {
				Promise.resolve(state.onSessionDestroy(sessionId)).catch(() => {});
			} catch {
				// fire-and-forget — sync throws are silently caught
			}
		}
	};

	// --- Public API ---

	function use(middleware: ToolMiddleware): void {
		state.globalMiddlewares.push(middleware);
	}

	function tool(...args: unknown[]): void {
		const name = args[0] as string;
		const parsed = parseMiddlewareArgs(`tool("${name}")`, args.slice(1));

		if (typeof (parsed.config as Record<string, unknown>).name === "string") {
			throw new TypeError(
				`tool("${name}"): second-to-last argument must be a config object`,
			);
		}

		const toolConfig = parsed.config as ToolConfig;
		const allMiddlewares = [...state.globalMiddlewares, ...parsed.middlewares];

		const toolInfo: ToolInfo = {
			name,
			description: toolConfig.description,
			middlewares: allMiddlewares,
		};

		state.tools.set(name, {
			name,
			description: toolConfig.description,
			input: toolConfig.input,
			handler: parsed.handler as ToolHandler,
			middlewares: allMiddlewares,
			hiddenByMiddlewares: cacheHiddenMiddlewares(toolInfo, allMiddlewares),
		});
	}

	function resource(...args: unknown[]): void {
		const uri = args[0] as string;
		const parsed = parseMiddlewareArgs(`resource("${uri}")`, args.slice(1));

		if (typeof (parsed.config as Record<string, unknown>).name !== "string") {
			throw new TypeError(
				`resource("${uri}"): second-to-last argument must be a config object with a "name" property`,
			);
		}

		const resConfig = parsed.config as ResourceConfig;
		const allMiddlewares = [...state.globalMiddlewares, ...parsed.middlewares];

		const resourceInfo: ToolInfo = {
			name: resConfig.name,
			description: resConfig.description,
			middlewares: allMiddlewares,
		};

		const isTemplate = uri.includes("{");

		state.resources.set(uri, {
			uri,
			isTemplate,
			uriPattern: isTemplate ? buildTemplatePattern(uri) : null,
			name: resConfig.name,
			description: resConfig.description,
			mimeType: resConfig.mimeType,
			handler: parsed.handler as ResourceHandler,
			middlewares: allMiddlewares,
			hiddenByMiddlewares: cacheHiddenMiddlewares(resourceInfo, allMiddlewares),
		});
	}

	function task(...args: unknown[]): void {
		const name = args[0] as string;
		const parsed = parseMiddlewareArgs(`task("${name}")`, args.slice(1));

		if (typeof (parsed.config as Record<string, unknown>).name === "string") {
			throw new TypeError(
				`task("${name}"): second-to-last argument must be a config object`,
			);
		}

		const taskConfig = parsed.config as TaskConfig;
		const allMiddlewares = [...state.globalMiddlewares, ...parsed.middlewares];

		const taskInfo: ToolInfo = {
			name,
			description: taskConfig.description,
			middlewares: allMiddlewares,
		};

		state.tasks.set(name, {
			name,
			description: taskConfig.description,
			input: taskConfig.input,
			handler: parsed.handler as TaskHandler,
			middlewares: allMiddlewares,
			hiddenByMiddlewares: cacheHiddenMiddlewares(taskInfo, allMiddlewares),
		});
	}

	async function stdio(): Promise<void> {
		const { StdioServerTransport } = await import(
			"@modelcontextprotocol/sdk/server/stdio.js"
		);
		const transport = new StdioServerTransport();
		await server.connect(transport);
		if (state.onServerStart) {
			await Promise.resolve(state.onServerStart()).catch(() => {});
		}
	}

	async function connect(transport: Transport): Promise<void> {
		await server.connect(transport);
	}

	const http = createHttpAdapter(
		info,
		state,
		taskStore,
		server,
		elicitation,
		cancelledTaskIds,
		setupHandlers,
	);

	return {
		use,
		tool: tool as MCPServer["tool"],
		resource: resource as MCPServer["resource"],
		task: task as MCPServer["task"],
		stdio,
		http,
		session: (sessionId: string) => createSessionAPI(state, server, sessionId),
		completeElicitation: elicitation.complete,
		store: state.store,
		connect,
		/** @internal Exposed for testing. */
		_server: server,
		_getSession: (sessionId: string) => getSession(state, sessionId),
		_isToolVisible(toolName: string, sessionId: string): boolean {
			const t = state.tools.get(toolName);
			if (!t) return false;
			return isToolVisible(state, t, sessionId);
		},
		_isResourceVisible(uri: string, sessionId: string): boolean {
			const r = state.resources.get(uri);
			if (!r) return false;
			return isResourceVisible(state, r, sessionId);
		},
		_isTaskVisible(taskName: string, sessionId: string): boolean {
			const t = state.tasks.get(taskName);
			if (!t) return false;
			return isTaskVisible(state, t, sessionId);
		},
		_createSessionAPI: (sessionId: string) =>
			createSessionAPI(state, server, sessionId),
	} as MCPServer & {
		connect(transport: Transport): Promise<void>;
		_server: Server;
		_getSession(sessionId: string): SessionState;
		_isToolVisible(toolName: string, sessionId: string): boolean;
		_isResourceVisible(uri: string, sessionId: string): boolean;
		_isTaskVisible(taskName: string, sessionId: string): boolean;
		_createSessionAPI(sessionId: string): Session;
	};
}
