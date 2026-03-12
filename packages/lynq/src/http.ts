import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { ElicitationTracker, ServerState } from "./internal-types.js";
import { createSessionAPI } from "./session.js";
import type { HttpAdapterOptions, ServerOptions } from "./types.js";

export function createHttpAdapter(
	info: ServerOptions,
	state: ServerState,
	// biome-ignore lint/suspicious/noExplicitAny: task store type from SDK
	taskStore: any,
	defaultServer: Server,
	elicitation: ElicitationTracker,
	cancelledTaskIds: Set<string>,
	setupHandlersFn: (
		sdkServer: Server,
		state: ServerState,
		defaultServer: Server,
		elicitation: ElicitationTracker,
		cancelledTaskIds: Set<string>,
	) => void,
): (options?: HttpAdapterOptions) => (req: Request) => Promise<Response> {
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
		setupHandlersFn(srv, state, defaultServer, elicitation, cancelledTaskIds);
		return srv;
	}

	return function http(
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
		let started = false;

		return async (req: Request): Promise<Response> => {
			if (!started && state.onServerStart) {
				started = true;
				Promise.resolve(state.onServerStart()).catch(() => {});
			}
			const T = await lazyImport();
			const sessionId = req.headers.get("mcp-session-id");

			// Route to existing session
			if (sessionId) {
				const session = httpSessions.get(sessionId);
				if (session) {
					if (options?.onRequest) {
						await options.onRequest(
							req,
							sessionId,
							createSessionAPI(state, defaultServer, sessionId),
						);
					}
					return session.transport.handleRequest(req);
				}
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
					state.serverBySession.set(sid, srv);
					if (options?.onRequest) {
						options.onRequest(
							req,
							sid,
							createSessionAPI(state, defaultServer, sid),
						);
					}
				},
				onsessionclosed: (sid: string) => {
					httpSessions.delete(sid);
					state.serverBySession.delete(sid);
					state.sessions.delete(sid);
					if (state.onSessionDestroy) {
						Promise.resolve(state.onSessionDestroy(sid)).catch(() => {});
					}
				},
			});
			await srv.connect(transport);
			srv.onclose = () => {
				for (const [sid, entry] of httpSessions) {
					if (entry.server === srv) {
						httpSessions.delete(sid);
						state.serverBySession.delete(sid);
						state.sessions.delete(sid);
						if (state.onSessionDestroy) {
							Promise.resolve(state.onSessionDestroy(sid)).catch(() => {});
						}
						break;
					}
				}
			};
			return transport.handleRequest(req);
		};
	};
}
