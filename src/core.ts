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
	MCPServer,
	ResourceConfig,
	ResourceContext,
	ResourceHandler,
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
	const sessions = new Map<string, SessionState>();

	const server = new Server(info, {
		capabilities: {
			tools: { listChanged: true },
			resources: { listChanged: true },
		},
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

	// Shared visibility logic for tools and resources
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
		const state = getSession(sessionId);
		return isVisible(
			tool.hiddenByMiddlewares,
			tool.name,
			state.toolOverrides,
			state.grants,
		);
	}

	function isResourceVisible(
		res: InternalResource,
		sessionId: string,
	): boolean {
		const state = getSession(sessionId);
		return isVisible(
			res.hiddenByMiddlewares,
			res.uri,
			state.resourceOverrides,
			state.grants,
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
			};

			// Run middleware onCall chain using a ToolContext adapter
			const toolCtx: ToolContext = {
				toolName: res.uri,
				session: ctx.session,
				signal: extra.signal,
				sessionId,
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

	function resource(...args: unknown[]): void {
		const uri = args[0] as string;
		const rest = args.slice(1);

		const handler = rest[rest.length - 1];
		if (typeof handler !== "function") {
			throw new TypeError(
				`resource("${uri}"): last argument must be a handler function`,
			);
		}

		const config = rest[rest.length - 2];
		if (
			config == null ||
			typeof config !== "object" ||
			Array.isArray(config) ||
			typeof (config as Record<string, unknown>).name !== "string"
		) {
			throw new TypeError(
				`resource("${uri}"): second-to-last argument must be a config object with a "name" property`,
			);
		}

		// Everything between URI and config is per-resource middleware
		const perResourceMiddlewares = rest.slice(0, -2);
		for (const mw of perResourceMiddlewares) {
			if (
				!mw ||
				typeof mw !== "object" ||
				typeof (mw as Record<string, unknown>).name !== "string"
			) {
				throw new TypeError(
					`resource("${uri}"): each middleware must have a "name" property`,
				);
			}
		}

		const resConfig = config as ResourceConfig;
		const middlewares = perResourceMiddlewares as ToolMiddleware[];
		// No global middlewares for resources

		const resourceInfo: ToolInfo = {
			name: resConfig.name,
			description: resConfig.description,
			middlewares,
		};

		const hiddenByMiddlewares: string[] = [];
		for (const mw of middlewares) {
			if (mw.onRegister?.(resourceInfo) === false) {
				hiddenByMiddlewares.push(mw.name);
			}
		}

		const isTemplate = uri.includes("{");

		const internalResource: InternalResource = {
			uri,
			isTemplate,
			uriPattern: isTemplate ? buildTemplatePattern(uri) : null,
			name: resConfig.name,
			description: resConfig.description,
			mimeType: resConfig.mimeType,
			handler: handler as ResourceHandler,
			middlewares,
			hiddenByMiddlewares,
		};

		resources.set(uri, internalResource);
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
		_createSessionAPI: createSessionAPI,
	} as MCPServer & {
		connect(transport: Transport): Promise<void>;
		_server: Server;
		_getSession(sessionId: string): SessionState;
		_isToolVisible(toolName: string, sessionId: string): boolean;
		_isResourceVisible(uri: string, sessionId: string): boolean;
		_createSessionAPI(sessionId: string): Session;
	};
}
