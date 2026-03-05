import { InMemoryTaskStore } from "@modelcontextprotocol/sdk/experimental/tasks";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
	type ZodRawShapeCompat,
	normalizeObjectSchema,
} from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import {
	CallToolRequestSchema,
	ListResourceTemplatesRequestSchema,
	ListResourcesRequestSchema,
	ListToolsRequestSchema,
	ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type {
	Elicit,
	MCPServer,
	ResourceConfig,
	ResourceContext,
	ResourceHandler,
	RootInfo,
	Session,
	TaskConfig,
	TaskContext,
	TaskControl,
	TaskHandler,
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

interface InternalResource {
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

interface InternalTask {
	name: string;
	description: string | undefined;
	input: unknown;
	handler: TaskHandler;
	middlewares: ToolMiddleware[];
	hiddenByMiddlewares: string[];
}

interface SessionState {
	data: Map<string, unknown>;
	grants: Set<string>;
	toolOverrides: Map<string, "enabled" | "disabled">;
	resourceOverrides: Map<string, "enabled" | "disabled">;
}

// === Helpers ===

function inputToJsonSchema(input: unknown): Record<string, unknown> {
	if (input == null) return { type: "object" };
	const normalized = normalizeObjectSchema(input as ZodRawShapeCompat);
	return normalized
		? (toJsonSchemaCompat(normalized) as Record<string, unknown>)
		: (input as Record<string, unknown>);
}

function parseMiddlewareArgs(
	label: string,
	args: unknown[],
	// biome-ignore lint/complexity/noBannedTypes: handler type is narrowed by each caller
): { middlewares: ToolMiddleware[]; config: unknown; handler: Function } {
	const handler = args[args.length - 1];
	if (typeof handler !== "function") {
		throw new TypeError(`${label}: last argument must be a handler function`);
	}
	const config = args[args.length - 2];
	if (config == null || typeof config !== "object" || Array.isArray(config)) {
		throw new TypeError(
			`${label}: second-to-last argument must be a config object`,
		);
	}
	const mws = args.slice(0, -2);
	for (const mw of mws) {
		if (
			!mw ||
			typeof mw !== "object" ||
			typeof (mw as Record<string, unknown>).name !== "string"
		) {
			throw new TypeError(
				`${label}: each middleware must have a "name" property`,
			);
		}
	}
	return { middlewares: mws as ToolMiddleware[], config, handler };
}

function cacheHiddenMiddlewares(
	info: ToolInfo,
	middlewares: ToolMiddleware[],
): string[] {
	const hidden: string[] = [];
	for (const mw of middlewares) {
		if (mw.onRegister?.(info) === false) {
			hidden.push(mw.name);
		}
	}
	return hidden;
}

// === createMCPServer ===

function buildTemplatePattern(uri: string): RegExp {
	// Replace {variable} placeholders first, then escape the rest
	const parts = uri.split(/\{[^}]+\}/);
	const escaped = parts.map((p) => p.replace(/[.*+?^$|()[\]\\]/g, "\\$&"));
	return new RegExp(`^${escaped.join("(.+)")}$`);
}

export function createMCPServer(info: {
	name: string;
	version: string;
}): MCPServer {
	const globalMiddlewares: ToolMiddleware[] = [];
	const tools = new Map<string, InternalTool>();
	const resources = new Map<string, InternalResource>();
	const tasks = new Map<string, InternalTask>();
	const sessions = new Map<string, SessionState>();

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

	function isVisible(
		hiddenByMiddlewares: string[],
		key: string,
		overrides: Map<string, "enabled" | "disabled">,
		grants: Set<string>,
	): boolean {
		const override = overrides.get(key);
		if (override === "disabled") return false;
		if (override === "enabled") return true;
		for (const mwName of hiddenByMiddlewares) {
			if (!grants.has(mwName)) return false;
		}
		return true;
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

	function notifyToolListChanged(): void {
		server.sendToolListChanged().catch(() => {});
	}

	function notifyResourceListChanged(): void {
		server.sendResourceListChanged().catch(() => {});
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
				notifyResourceListChanged();
			},
			revoke(middlewareName: string): void {
				state.grants.delete(middlewareName);
				notifyToolListChanged();
				notifyResourceListChanged();
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
			enableResources(...uris: string[]): void {
				for (const uri of uris) {
					state.resourceOverrides.set(uri, "enabled");
				}
				notifyResourceListChanged();
			},
			disableResources(...uris: string[]): void {
				for (const uri of uris) {
					state.resourceOverrides.set(uri, "disabled");
				}
				notifyResourceListChanged();
			},
		};
	}

	function createElicit(): Elicit {
		return {
			async form({ message, schema }) {
				const r = await server.elicitInput({
					message,
					// biome-ignore lint/suspicious/noExplicitAny: SDK's PrimitiveSchemaDefinition union is too narrow for our simplified schema type
					requestedSchema: { type: "object", properties: schema as any },
				});
				return {
					action: r.action,
					content: (r.content ?? {}) as Record<
						string,
						string | number | boolean | string[]
					>,
				};
			},
			async url({ message, url }) {
				const r = await server.elicitInput({
					mode: "url",
					message,
					url,
					elicitationId: crypto.randomUUID(),
				});
				return { action: r.action };
			},
		};
	}

	function createRootsAccessor(): () => Promise<RootInfo[]> {
		return async () => {
			try {
				const result = await server.listRoots();
				return result.roots.map((r) => {
					const info: RootInfo = { uri: r.uri };
					if (r.name !== undefined) info.name = r.name;
					return info;
				});
			} catch {
				return [];
			}
		};
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

	function findResource(uri: string): InternalResource | undefined {
		// Exact match first (static resources)
		const exact = resources.get(uri);
		if (exact) return exact;

		// Template match
		for (const res of resources.values()) {
			if (res.isTemplate && res.uriPattern?.test(uri)) {
				return res;
			}
		}

		return undefined;
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

	server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
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

			const ctx: ToolContext = {
				toolName: name,
				session: createSessionAPI(sessionId),
				signal: extra.signal,
				sessionId,
				elicit: createElicit(),
				roots: createRootsAccessor(),
			};

			const finalHandler = () => Promise.resolve(tool.handler(args ?? {}, ctx));
			const chain = buildMiddlewareChain(tool.middlewares, ctx, finalHandler);
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
				toolName: name,
				session: createSessionAPI(sessionId),
				signal: extra.signal,
				sessionId,
				elicit: createElicit(),
				roots: createRootsAccessor(),
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

			const chain = buildMiddlewareChain(task.middlewares, ctx, finalHandler);
			return chain();
		}

		return toolErr(`Unknown tool: ${name}`);
	});

	server.setRequestHandler(ListResourcesRequestSchema, (_request, extra) => {
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
	});

	server.setRequestHandler(
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

	server.setRequestHandler(
		ReadResourceRequestSchema,
		async (request, extra) => {
			const { uri } = request.params;
			const res = findResource(uri);

			if (!res) {
				throw new Error(`Unknown resource: ${uri}`);
			}

			const sessionId = extra.sessionId ?? "default";

			if (!isResourceVisible(res, sessionId)) {
				throw new Error(`Resource not available: ${uri}`);
			}

			const ctx: ResourceContext = {
				uri,
				session: createSessionAPI(sessionId),
				sessionId,
				roots: createRootsAccessor(),
			};

			// Run middleware onCall chain using a ToolContext adapter
			const toolCtx: ToolContext = {
				toolName: res.uri,
				session: ctx.session,
				signal: extra.signal,
				sessionId,
				elicit: createElicit(),
				roots: createRootsAccessor(),
			};

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

	return {
		use,
		tool: tool as MCPServer["tool"],
		resource: resource as MCPServer["resource"],
		task: task as MCPServer["task"],
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
