import { InMemoryTaskStore } from "@modelcontextprotocol/sdk/experimental/tasks";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
	CallToolRequestSchema,
	ErrorCode,
	ListResourceTemplatesRequestSchema,
	ListResourcesRequestSchema,
	ListToolsRequestSchema,
	McpError,
	ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createRootsAccessor, createToolContext } from "./context.js";
import {
	buildMiddlewareChain,
	findResourceByUri,
	inputToJsonSchema,
} from "./helpers.js";
import type { ElicitationTracker, ServerState } from "./internal-types.js";
import { error as errorResponse } from "./response.js";
import {
	createSessionAPI,
	isResourceVisible,
	isTaskVisible,
	isToolVisible,
} from "./session.js";
import { createUserStore } from "./store.js";
import type { ResourceContext, TaskContext, TaskControl } from "./types.js";

export function createTaskStore(): {
	taskStore: InstanceType<typeof InMemoryTaskStore>;
	cancelledTaskIds: Set<string>;
} {
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

	return { taskStore, cancelledTaskIds };
}

export function setupHandlers(
	sdkServer: Server,
	state: ServerState,
	defaultServer: Server,
	elicitation: ElicitationTracker,
	cancelledTaskIds: Set<string>,
): void {
	sdkServer.setRequestHandler(ListToolsRequestSchema, (_request, extra) => {
		const sessionId = extra.sessionId ?? "default";
		const visibleTools = [];

		for (const tool of state.tools.values()) {
			if (isToolVisible(state, tool, sessionId)) {
				visibleTools.push({
					name: tool.name,
					description: tool.description,
					inputSchema: inputToJsonSchema(tool.input),
				});
			}
		}

		for (const task of state.tasks.values()) {
			if (isTaskVisible(state, task, sessionId)) {
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

	sdkServer.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
		const { name, arguments: args } = request.params;
		const sessionId = extra.sessionId ?? "default";

		// Regular tool
		const tool = state.tools.get(name);
		if (tool) {
			if (!isToolVisible(state, tool, sessionId))
				throw new McpError(
					ErrorCode.MethodNotFound,
					`Tool not available: ${name}`,
				);

			const toolArgs = args ?? {};
			const c = createToolContext(
				sdkServer,
				sessionId,
				createSessionAPI(state, defaultServer, sessionId),
				name,
				toolArgs,
				extra.signal,
				state.store,
				(eid, srv) => elicitation.register(eid, sessionId, srv),
				elicitation.cancel,
			);

			const finalHandler = () => Promise.resolve(tool.handler(toolArgs, c));
			const chain = buildMiddlewareChain(tool.middlewares, c, finalHandler);
			return chain();
		}

		// Task tool
		const task = state.tasks.get(name);
		if (task) {
			if (!isTaskVisible(state, task, sessionId))
				throw new McpError(
					ErrorCode.MethodNotFound,
					`Tool not available: ${name}`,
				);
			const requestTaskStore = extra.taskStore;
			if (!requestTaskStore)
				throw new McpError(ErrorCode.InternalError, "Task store not available");

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

			const taskArgs = args ?? {};
			const c: TaskContext = {
				...createToolContext(
					sdkServer,
					sessionId,
					createSessionAPI(state, defaultServer, sessionId),
					name,
					taskArgs,
					extra.signal,
					state.store,
					(eid, srv) => elicitation.register(eid, sessionId, srv),
					elicitation.cancel,
				),
				task: taskControl,
			};

			const finalHandler = async (): Promise<CallToolResult> => {
				const taskPromise = (async () => {
					try {
						const result = await task.handler(taskArgs, c);
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
								.storeTaskResult(taskId, "failed", errorResponse(msg))
								.catch(() => {});
						}
					}
				})();
				state.runningTasks.add(taskPromise);
				taskPromise.finally(() => state.runningTasks.delete(taskPromise));
				return { task: createdTask } as unknown as CallToolResult;
			};

			const chain = buildMiddlewareChain(task.middlewares, c, finalHandler);
			return chain();
		}

		throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
	});

	sdkServer.setRequestHandler(ListResourcesRequestSchema, (_request, extra) => {
		const sessionId = extra.sessionId ?? "default";
		const visibleResources = [];

		for (const res of state.resources.values()) {
			if (!res.isTemplate && isResourceVisible(state, res, sessionId)) {
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

	sdkServer.setRequestHandler(
		ListResourceTemplatesRequestSchema,
		(_request, extra) => {
			const sessionId = extra.sessionId ?? "default";
			const visibleTemplates = [];

			for (const res of state.resources.values()) {
				if (res.isTemplate && isResourceVisible(state, res, sessionId)) {
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
			const res = findResourceByUri(state.resources, uri);

			if (!res) {
				throw new McpError(
					ErrorCode.InvalidRequest,
					`Unknown resource: ${uri}`,
				);
			}

			const sessionId = extra.sessionId ?? "default";

			if (!isResourceVisible(state, res, sessionId)) {
				throw new McpError(
					ErrorCode.InvalidRequest,
					`Resource not available: ${uri}`,
				);
			}

			const session = createSessionAPI(state, defaultServer, sessionId);

			const c: ResourceContext = {
				uri,
				session,
				sessionId,
				roots: createRootsAccessor(sdkServer),
				store: state.store,
				userStore: createUserStore(session, state.store),
			};

			// Run middleware onCall chain using a ToolContext adapter
			const toolC = createToolContext(
				sdkServer,
				sessionId,
				session,
				res.uri,
				{},
				extra.signal,
				state.store,
				(eid, srv) => elicitation.register(eid, sessionId, srv),
				elicitation.cancel,
			);

			const finalHandler = async () => {
				const content = await res.handler(uri, c);
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

			const chain = buildMiddlewareChain(res.middlewares, toolC, finalHandler);

			return chain();
		},
	);
}
