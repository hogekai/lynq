# lynq

Lightweight MCP server framework. Tool visibility control through middleware.

## Concept

MCP is a bidirectional protocol — servers can push tool list changes to clients at any time. This enables session-aware tool visibility: show or hide tools based on runtime state like authentication. But wiring the bidirectional notification by hand is tedious and error-prone. lynq absorbs that plumbing. You declare visibility rules as Hono-style middleware, and lynq handles the protocol-level notifications internally. Users write `server.tool("weather", auth(), config, handler)` and never touch `sendToolListChanged`.

## Philosophy

Think Deno, not webpack. Think Hono, not Express. Think vide (../vide), not video.js. Defaults are minimal. Extensions are explicit. Nothing implicit.

## Rules

- **Delegate, don't wrap.** If the official MCP SDK already has the API, use it. Example: schema conversion is delegated to the SDK's `toJsonSchemaCompat` — lynq never parses schemas.
- **Pure functions over stateful objects.** Middleware factories return plain objects. No classes.
- **ESM only.** No CJS. `sideEffects: false`.
- **Types are the docs.** If the API isn't obvious from type signatures alone, redesign the API.
- **Dependency direction: one way.** Middleware → core. Never reverse. Never circular.
- **One runtime dependency.** `@modelcontextprotocol/sdk` as peer dep. Nothing else in core.
- **`createMCPServer(info)` is the entire API surface.** No config files, no directory scanning.
- **Middleware is Hono-style.** Global via `server.use(middleware)`. Per-tool via `server.tool("name", middleware, config, handler)`. Per-resource via `server.resource("uri", middleware, config, handler)`. Per-task via `server.task("name", middleware, config, handler)`. `server.use()` applies to tools and tasks.
- **Tool, resource, and task visibility is session-scoped.** `tool()`, `resource()`, and `task()` share the same middleware pattern. `ctx.session.authorize()` / `ctx.session.revoke()` affect all. Bidirectional notification is internal — users never touch it.
- **`@experimental` marks unstable APIs.** `server.task()` depends on the MCP SDK's experimental Tasks API. User-facing interface is stable; internal SDK wiring may change.
- **ctx follows Hono's Context pattern.** `ctx.session.set()` / `ctx.session.get()`.
- **`ctx.roots()` queries client-provided filesystem roots.** Returns `Promise<RootInfo[]>`. Empty array if client lacks roots capability. No caching — each call queries the client.
- **`ctx.sample()` requests LLM inference from the client.** `ctx.sample(prompt, options?)` → `Promise<string>`. `ctx.sample.raw(sdkParams)` → `Promise<CreateMessageResult>`. Available in tool and task handlers. Not in resource handlers.
- **`server.http(options?)` returns a Web Standard request handler.** `(req: Request) => Promise<Response>`. Mounts in Hono, Deno, Cloudflare Workers — any framework. Lazy-imports `WebStandardStreamableHTTPServerTransport` from the SDK. Stateful mode (default): per-session Server+Transport, session IDs via `Mcp-Session-Id` header. Sessionless mode: new Server+Transport per request. `enableJsonResponse` option returns JSON instead of SSE.
- **`onResult` hook for post-handler result transformation.** `ToolMiddleware.onResult?(result, ctx)` runs after the handler returns. Execution order: `onCall` chain → handler → `onResult` (reverse middleware order) → `onCall` post-next processing. If `onCall` short-circuits (doesn't call `next()`), `onResult` does not run.
- **Framework adapters are optional entry points.** `lynq/hono` and `lynq/express` provide `mountLynq(app, server, options?)`. DNS rebinding protection included by default for localhost. No additional runtime dependencies — framework types are peer deps.

## Out of scope

Auth implementation, database, session persistence.

## When adding features

1. Can the official MCP SDK do it natively? → Don't build it. Delegate.
2. Is it needed by <80% of MCP server authors? → Middleware, not core.
3. Does it add a runtime dependency beyond `@modelcontextprotocol/sdk`? → Reject.

## Stack

TypeScript strict · ESM · tsup · vitest · Biome · pnpm

## Structure

Single package, multiple entry points via `exports` field:
- `lynq` — core (`createMCPServer` + types)
- `lynq/auth` — auth middleware (`auth()`)
- `lynq/stdio` — re-export of `StdioServerTransport`
- `lynq/hono` — Hono adapter (`mountLynq`)
- `lynq/express` — Express adapter (`mountLynq`)

```
src/
├── index.ts          — public exports
├── types.ts          — all type definitions
├── core.ts           — createMCPServer + state management + request handlers
├── helpers.ts        — pure functions (isVisible, buildMiddlewareChain, parseMiddlewareArgs, etc.)
├── context.ts        — ctx factories (createElicit, createRootsAccessor, createSample, createToolContext)
├── internal-types.ts — internal interfaces (InternalTool, InternalResource, etc.)
├── middleware/
│   └── auth.ts       — auth() middleware
└── adapters/
    ├── stdio.ts      — stdio transport re-export
    ├── shared.ts     — validateHost utility for DNS rebinding protection
    ├── hono.ts       — mountLynq for Hono
    └── express.ts    — mountLynq for Express
tests/
├── core.test.ts
├── http.test.ts
├── resource.test.ts
├── sampling.test.ts
├── task.test.ts
├── middleware/
│   └── auth.test.ts
└── adapters/
    ├── hono.test.ts
    └── express.test.ts
```
