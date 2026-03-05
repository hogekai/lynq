import { InMemoryTaskStore } from "@modelcontextprotocol/sdk/experimental/tasks";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
	CallToolRequestSchema,
	ListResourceTemplatesRequestSchema,
	ListResourcesRequestSchema,
	ListToolsRequestSchema,
	ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createRootsAccessor, createToolContext } from "./context.js";
import {
	buildMiddlewareChain,
	buildTemplatePattern,
	cacheHiddenMiddlewares,
	findResourceByUri,
	inputToJsonSchema,
	isVisible,
	parseMiddlewareArgs,
} from "./helpers.js";
import type {
	InternalResource,
	InternalTask,
	InternalTool,
	SessionState,
} from "./internal-types.js";
import type {
	HttpAdapterOptions,
	MCPServer,
	ResourceConfig,
	ResourceContext,
	ResourceHandler,
	Session,
	TaskConfig,
	TaskContext,
	TaskControl,
	TaskHandler,
	ToolConfig,
	ToolHandler,
	ToolInfo,
	ToolMiddleware,
} from "./types.js";

// === createMCPServer ===

export function createMCPServer(info: {
	name: string;
	version: string;
}): MCPServer {
	const globalMiddlewares: ToolMiddleware[] = [];
	const tools = new Map<string, InternalTool>();
	const resources = new Map<string, InternalResource>();
	const tasks = new Map<string, InternalTask>();
	const sessions = new Map<string, SessionState>();
	const serverBySession = new Map<string, Server>();

	// Task infrastructure
	const cancelledTaskIds = new Set<string>();
	const baseTaskStore = new InMemoryTaskStore();
	const taskStore = new Proxy(baseTaskStore, {
		get(target, prop, receiver) {
			if (prop === "updateTaskStatus") {
				return async (taskId: string, status: string, ...rest: unknown[]) => {
					if (status === "cancelled") cancelledTaskIds.add(taskId);
					// biome-ignore lint/complexity/noBannedTypes: Proxy interception requires dynamic call
					return (target.updateTaskStatus as Function).call(
						target,
						taskId,
						status,
						...rest,
					);
				};
			}
			return Reflect.get(target, prop, receiver);
		},
	});

	const server = new Server(info, {
		capabilities: {
			tools: { listChanged: true },
			resources: { listChanged: true },
			tasks: { list: {}, cancel: {}, requests: { tools: { call: {} } } },
		},
		taskStore,
	});

	function getSession(sessionId: string): SessionState {
		let session = sessions.get(sessionId);
		if (!session) {
			session = {
				data: new Map(),
				grants: new Set(),
				toolOverrides: new Map(),
				resourceOverrides: new Map(),
			};
			sessions.set(sessionId, session);
		}
		return session;
	}

	function isToolVisible(tool: InternalTool, sessionId: string): boolean {
		const s = getSession(sessionId);
		return isVisible(
			tool.hiddenByMiddlewares,
			tool.name,
			s.toolOverrides,
			s.grants,
		);
	}

	function isResourceVisible(
		res: InternalResource,
		sessionId: string,
	): boolean {
		const s = getSession(sessionId);
		return isVisible(
			res.hiddenByMiddlewares,
			res.uri,
			s.resourceOverrides,
			s.grants,
		);
	}

	function isTaskVisible(task: InternalTask, sessionId: string): boolean {
		const s = getSession(sessionId);
		return isVisible(
			task.hiddenByMiddlewares,
			task.name,
			s.toolOverrides,
			s.grants,
		);
	}

	function notifyToolListChanged(sessionId?: string): void {
		const srv = (sessionId && serverBySession.get(sessionId)) || server;
		srv.sendToolListChanged().catch(() => {});
	}

	function notifyResourceListChanged(sessionId?: string): void {
		const srv = (sessionId && serverBySession.get(sessionId)) || server;
		srv.sendResourceListChanged().catch(() => {});
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
				notifyToolListChanged(sessionId);
				notifyResourceListChanged(sessionId);
			},
			revoke(middlewareName: string): void {
				state.grants.delete(middlewareName);
				notifyToolListChanged(sessionId);
				notifyResourceListChanged(sessionId);
			},
			enableTools(...names: string[]): void {
				for (const name of names) {
					state.toolOverrides.set(name, "enabled");
				}
				notifyToolListChanged(sessionId);
			},
			disableTools(...names: string[]): void {
				for (const name of names) {
					state.toolOverrides.set(name, "disabled");
				}
				notifyToolListChanged(sessionId);
			},
			enableResources(...uris: string[]): void {
				for (const uri of uris) {
					state.resourceOverrides.set(uri, "enabled");
				}
				notifyResourceListChanged(sessionId);
			},
			disableResources(...uris: string[]): void {
				for (const uri of uris) {
					state.resourceOverrides.set(uri, "disabled");
				}
				notifyResourceListChanged(sessionId);
			},
		};
	}

	// --- Request handlers ---

	function setupHandlers(sdkServer: Server): void {
		sdkServer.setRequestHandler(ListToolsRequestSchema, (_request, extra) => {
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

			for (const task of tasks.values()) {
				if (isTaskVisible(task, sessionId)) {
					visibleTools.push({
						name: task.name,
						description: task.description,
						inputSchema: inputToJsonSchema(task.input),
						execution: { taskSupport: "required" as const },
					});
				}
			}

			return { tools: visibleTools };
		});

		sdkServer.setRequestHandler(
			CallToolRequestSchema,
			async (request, extra) => {
				const { name, arguments: args } = request.params;
				const sessionId = extra.sessionId ?? "default";

				const toolErr = (msg: string) => ({
					content: [{ type: "text" as const, text: msg }],
					isError: true as const,
				});

				// Regular tool
				const tool = tools.get(name);
				if (tool) {
					if (!isToolVisible(tool, sessionId))
						return toolErr(`Tool not available: ${name}`);

					const ctx = createToolContext(
						sdkServer,
						sessionId,
						createSessionAPI(sessionId),
						name,
						extra.signal,
					);

					const finalHandler = () =>
						Promise.resolve(tool.handler(args ?? {}, ctx));
					const chain = buildMiddlewareChain(
						tool.middlewares,
						ctx,
						finalHandler,
					);
					return chain();
				}

				// Task tool
				const task = tasks.get(name);
				if (task) {
					if (!isTaskVisible(task, sessionId))
						return toolErr(`Tool not available: ${name}`);
					const requestTaskStore = extra.taskStore;
					if (!requestTaskStore) return toolErr("Task store not available");

					const createdTask = await requestTaskStore.createTask({
						pollInterval: 1000,
					});
					const taskId = createdTask.taskId;

					const taskControl: TaskControl = {
						progress(pct: number, msg?: string) {
							if (cancelledTaskIds.has(taskId)) return;
							const status = msg ? `${pct}% ${msg}` : `${pct}%`;
							requestTaskStore
								.updateTaskStatus(taskId, "working", status)
								.catch(() => {});
						},
						get cancelled() {
							return cancelledTaskIds.has(taskId);
						},
					};

					const ctx: TaskContext = {
						...createToolContext(
							sdkServer,
							sessionId,
							createSessionAPI(sessionId),
							name,
							extra.signal,
						),
						task: taskControl,
					};

					const finalHandler = async (): Promise<CallToolResult> => {
						(async () => {
							try {
								const result = await task.handler(args ?? {}, ctx);
								if (!cancelledTaskIds.has(taskId)) {
									await requestTaskStore.storeTaskResult(
										taskId,
										"completed",
										result,
									);
								}
							} catch (err) {
								if (!cancelledTaskIds.has(taskId)) {
									const msg = err instanceof Error ? err.message : String(err);
									await requestTaskStore
										.storeTaskResult(taskId, "failed", {
											content: [{ type: "text", text: msg }],
											isError: true,
										})
										.catch(() => {});
								}
							}
						})();
						return { task: createdTask } as unknown as CallToolResult;
					};

					const chain = buildMiddlewareChain(
						task.middlewares,
						ctx,
						finalHandler,
					);
					return chain();
				}

				return toolErr(`Unknown tool: ${name}`);
			},
		);

		sdkServer.setRequestHandler(
			ListResourcesRequestSchema,
			(_request, extra) => {
				const sessionId = extra.sessionId ?? "default";
				const visibleResources = [];

				for (const res of resources.values()) {
					if (!res.isTemplate && isResourceVisible(res, sessionId)) {
						visibleResources.push({
							uri: res.uri,
							name: res.name,
							description: res.description,
							mimeType: res.mimeType,
						});
					}
				}

				return { resources: visibleResources };
			},
		);

		sdkServer.setRequestHandler(
			ListResourceTemplatesRequestSchema,
			(_request, extra) => {
				const sessionId = extra.sessionId ?? "default";
				const visibleTemplates = [];

				for (const res of resources.values()) {
					if (res.isTemplate && isResourceVisible(res, sessionId)) {
						visibleTemplates.push({
							uriTemplate: res.uri,
							name: res.name,
							description: res.description,
							mimeType: res.mimeType,
						});
					}
				}

				return { resourceTemplates: visibleTemplates };
			},
		);

		sdkServer.setRequestHandler(
			ReadResourceRequestSchema,
			async (request, extra) => {
				const { uri } = request.params;
				const res = findResourceByUri(resources, uri);

				if (!res) {
					throw new Error(`Unknown resource: ${uri}`);
				}

				const sessionId = extra.sessionId ?? "default";

				if (!isResourceVisible(res, sessionId)) {
					throw new Error(`Resource not available: ${uri}`);
				}

				const session = createSessionAPI(sessionId);

				const ctx: ResourceContext = {
					uri,
					session,
					sessionId,
					roots: createRootsAccessor(sdkServer),
				};

				// Run middleware onCall chain using a ToolContext adapter
				const toolCtx = createToolContext(
					sdkServer,
					sessionId,
					session,
					res.uri,
					extra.signal,
				);

				const finalHandler = async () => {
					const content = await res.handler(uri, ctx);
					return {
						contents: [
							{
								uri,
								mimeType: content.mimeType ?? res.mimeType,
								...(content.text != null ? { text: content.text } : {}),
								...(content.blob != null ? { blob: content.blob } : {}),
							},
						],
					};
				};

				const chain = buildMiddlewareChain(
					res.middlewares,
					toolCtx,
					finalHandler as unknown as () => Promise<CallToolResult>,
				);

				return chain() as unknown as Promise<{
					contents: Array<{
						uri: string;
						mimeType?: string;
						text?: string;
						blob?: string;
					}>;
				}>;
			},
		);
	}

	setupHandlers(server);

	// --- Public API ---

	function use(middleware: ToolMiddleware): void {
		globalMiddlewares.push(middleware);
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
		const allMiddlewares = [...globalMiddlewares, ...parsed.middlewares];

		const toolInfo: ToolInfo = {
			name,
			description: toolConfig.description,
			middlewares: allMiddlewares,
		};

		tools.set(name, {
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
		// No global middlewares for resources

		const resourceInfo: ToolInfo = {
			name: resConfig.name,
			description: resConfig.description,
			middlewares: parsed.middlewares,
		};

		const isTemplate = uri.includes("{");

		resources.set(uri, {
			uri,
			isTemplate,
			uriPattern: isTemplate ? buildTemplatePattern(uri) : null,
			name: resConfig.name,
			description: resConfig.description,
			mimeType: resConfig.mimeType,
			handler: parsed.handler as ResourceHandler,
			middlewares: parsed.middlewares,
			hiddenByMiddlewares: cacheHiddenMiddlewares(
				resourceInfo,
				parsed.middlewares,
			),
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
		const allMiddlewares = [...globalMiddlewares, ...parsed.middlewares];

		const taskInfo: ToolInfo = {
			name,
			description: taskConfig.description,
			middlewares: allMiddlewares,
		};

		tasks.set(name, {
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
	}

	async function connect(transport: Transport): Promise<void> {
		await server.connect(transport);
	}

	// --- HTTP adapter ---

	const serverCapabilities = {
		tools: { listChanged: true },
		resources: { listChanged: true },
		tasks: { list: {}, cancel: {}, requests: { tools: { call: {} } } },
	} as const;

	function createServerWithHandlers(): Server {
		const srv = new Server(info, {
			capabilities: serverCapabilities,
			taskStore,
		});
		setupHandlers(srv);
		return srv;
	}

	function http(
		options?: HttpAdapterOptions,
	): (req: Request) => Promise<Response> {
		// biome-ignore lint/suspicious/noExplicitAny: lazy-loaded transport class
		let TransportCtor: any = null;

		async function lazyImport() {
			if (!TransportCtor) {
				const mod = await import(
					"@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
				);
				TransportCtor = mod.WebStandardStreamableHTTPServerTransport;
			}
			return TransportCtor;
		}

		// Sessionless: new server+transport per request
		if (options?.sessionless) {
			return async (req: Request): Promise<Response> => {
				const T = await lazyImport();
				const srv = createServerWithHandlers();
				const transport = new T({
					sessionIdGenerator: undefined,
					enableJsonResponse: options?.enableJsonResponse,
				});
				await srv.connect(transport);
				return transport.handleRequest(req);
			};
		}

		// Stateful: per-session routing
		// biome-ignore lint/suspicious/noExplicitAny: transport type from lazy import
		const httpSessions = new Map<string, { server: Server; transport: any }>();

		return async (req: Request): Promise<Response> => {
			const T = await lazyImport();
			const sessionId = req.headers.get("mcp-session-id");

			// Route to existing session
			if (sessionId) {
				const session = httpSessions.get(sessionId);
				if (session) return session.transport.handleRequest(req);
				return new Response(
					JSON.stringify({
						jsonrpc: "2.0",
						error: { code: -32000, message: "Session not found" },
					}),
					{
						status: 404,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			// New session
			const srv = createServerWithHandlers();
			const transport = new T({
				sessionIdGenerator:
					options?.sessionIdGenerator ?? (() => crypto.randomUUID()),
				enableJsonResponse: options?.enableJsonResponse,
				onsessioninitialized: (sid: string) => {
					httpSessions.set(sid, { server: srv, transport });
					serverBySession.set(sid, srv);
				},
				onsessionclosed: (sid: string) => {
					httpSessions.delete(sid);
					serverBySession.delete(sid);
				},
			});
			await srv.connect(transport);
			return transport.handleRequest(req);
		};
	}

	return {
		use,
		tool: tool as MCPServer["tool"],
		resource: resource as MCPServer["resource"],
		task: task as MCPServer["task"],
		stdio,
		http,
		connect,
		/** @internal Exposed for testing. */
		_server: server,
		_getSession: getSession,
		_isToolVisible(toolName: string, sessionId: string): boolean {
			const t = tools.get(toolName);
			if (!t) return false;
			return isToolVisible(t, sessionId);
		},
		_isResourceVisible(uri: string, sessionId: string): boolean {
			const r = resources.get(uri);
			if (!r) return false;
			return isResourceVisible(r, sessionId);
		},
		_isTaskVisible(taskName: string, sessionId: string): boolean {
			const t = tasks.get(taskName);
			if (!t) return false;
			return isTaskVisible(t, sessionId);
		},
		_createSessionAPI: createSessionAPI,
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
