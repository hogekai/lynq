# lynq

Lightweight MCP server framework. Tool visibility control through middleware.

## Concept

MCP is a bidirectional protocol — servers can push tool list changes to clients at any time. This enables session-aware tool visibility: show or hide tools based on runtime state like authentication. But wiring the bidirectional notification by hand is tedious and error-prone. lynq absorbs that plumbing. You declare visibility rules as Hono-style middleware, and lynq handles the protocol-level notifications internally. Users write `server.tool("weather", guard(), config, handler)` and never touch `sendToolListChanged`.

## Philosophy

Think Deno, not webpack. Think Hono, not Express. Think vide (../vide), not video.js. Defaults are minimal. Extensions are explicit. Nothing implicit.

## Rules

- **Delegate, don't wrap.** If the official MCP SDK already has the API, use it. Example: schema conversion is delegated to the SDK's `toJsonSchemaCompat` — lynq never parses schemas.
- **Pure functions over stateful objects.** Middleware factories return plain objects. No classes.
- **ESM only.** No CJS. `sideEffects: false`.
- **Types are the docs.** If the API isn't obvious from type signatures alone, redesign the API.
- **Dependency direction: one way.** Middleware → core. Never reverse. Never circular.
- **One runtime dependency.** `@modelcontextprotocol/sdk` as direct dependency. Nothing else in core.
- **`createMCPServer(info)` is the entire API surface.** No config files, no directory scanning.
- **Middleware is Hono-style.** Global via `server.use(middleware)`. Per-tool via `server.tool("name", middleware, config, handler)`. Per-resource via `server.resource("uri", middleware, config, handler)`. Per-task via `server.task("name", middleware, config, handler)`. `server.use()` applies to tools, resources, and tasks.
- **Tool, resource, and task visibility is session-scoped.** `tool()`, `resource()`, and `task()` share the same middleware pattern. `c.session.authorize()` / `c.session.revoke()` affect all. Bidirectional notification is internal — users never touch it.
- **`@experimental` marks unstable APIs.** `server.task()` depends on the MCP SDK's experimental Tasks API. User-facing interface is stable; internal SDK wiring may change.
- **`c` follows Hono's Context pattern.** `c.session.set()` / `c.session.get()`. Short name for minimal cognitive load.
- **`c.store` is a persistent async KV store (global scope).** `c.store.get(key)` / `c.store.set(key, value, ttl?)` / `c.store.delete(key)`. Available in tool, resource, and task handlers. TTL in seconds. `Store` interface only — users provide Redis/SQLite implementations. `memoryStore(options?)` is the default (in-process, lost on restart). Accepts `{ maxEntries?: number }` (default: 10000) — LRU eviction kicks in when capacity is reached.
- **`c.userStore` is a user-scoped persistent KV store.** Same API as `c.store` but keys are auto-prefixed with the user ID resolved from `c.session.get("user")`. Throws if no user in session. Supports string user, `{ id }`, or `{ sub }` objects.
- **`server.store` exposes the store instance.** For external HTTP callback routes that need to write persistent state (e.g. after OAuth/payment completion).
- **`createMCPServer` accepts `ServerOptions`.** Extends `ServerInfo` with optional `store?: Store`. Defaults to `memoryStore()` if omitted.
- **`c.roots()` queries client-provided filesystem roots.** Returns `Promise<RootInfo[]>`. Empty array if client lacks roots capability. No caching — each call queries the client.
- **`c.sample()` requests LLM inference from the client.** `c.sample(prompt, options?)` → `Promise<string>`. `c.sample.raw(sdkParams)` → `Promise<CreateMessageResult>`. Available in tool and task handlers. Not in resource handlers.
- **`server.http(options?)` returns a Web Standard request handler.** `(req: Request) => Promise<Response>`. Mounts in Hono, Deno, Cloudflare Workers — any framework. Lazy-imports `WebStandardStreamableHTTPServerTransport` from the SDK. Stateful mode (default): per-session Server+Transport, session IDs via `Mcp-Session-Id` header. Sessionless mode: new Server+Transport per request. `enableJsonResponse` option returns JSON instead of SSE. `onRequest` hook runs on each request after session is resolved — use to inject HTTP headers (e.g. Bearer tokens) into MCP sessions.
- **`onResult` hook for post-handler result transformation.** `ToolMiddleware.onResult?(result, c)` runs after the handler returns. Execution order: `onCall` chain → handler → `onResult` (reverse middleware order) → `onCall` post-next processing. If `onCall` short-circuits (doesn't call `next()`), `onResult` does not run.
- **Response helpers are standalone pure functions.** `text(value)`, `json(value)`, `error(message)`, `image(data, mimeType)` — exported from `lynq`. Also available as `c.text()`, `c.json()`, etc. on the context object. Chainable: `c.text("done").json({ id: 1 })`.
- **`c.elicit.form(message, zodSchema)` uses Zod for schemas.** Positional args, not property objects. Internally converts to JSON Schema via `inputToJsonSchema()`. `c.elicit.url(message, url)` — same positional pattern.
- **`urlAction`, `oauth`, `payment` support `persistent` option.** When `persistent: true`, state is checked/stored via `c.userStore` (async, survives reconnection) instead of `c.session` (sync, connection-scoped). Default: `false`. Requires a user in session for `userStore` key resolution. `c.session.authorize()` is still called for current-session visibility.
- **`c.args` exposes tool arguments in middleware.** `c.args: Record<string, unknown>` — the arguments passed to the tool call. Available in `onCall` and `onResult`. Empty object `{}` for resources.
- **`resolveUserId` convention.** `session.get("user")` is resolved to a user ID string. Accepted shapes: `string`, `{ id: string | number }`, `{ sub: string }`. Priority: `id` before `sub`. Exported `User` type documents accepted shapes. `userStore` throws with a descriptive error if the user value is set but does not match any accepted shape.
- **`skipIf` / `onComplete` for custom persistence.** All URL-based middleware (`urlAction`, `oauth`, `payment`, `github`, `google`, `stripe`, `crypto`) accept `skipIf?: (c: ToolContext) => boolean | Promise<boolean>` and `onComplete?: (c: ToolContext) => void | Promise<void>`. `skipIf` takes priority over `sessionKey` check. `onComplete` runs after elicitation succeeds, before `next()`. Use to call your own DB instead of Store.
- **Framework adapters are optional entry points.** `lynq/hono` and `lynq/express` provide `mountLynq(app, server, options?)`. DNS rebinding protection included by default for localhost. No additional runtime dependencies — framework types are peer deps.
- **Adapter `pages` option auto-registers OAuth/payment routes.** `mountLynq(app, server, { pages: { github: { clientId, clientSecret }, crypto: true } })`. Only specified providers are registered under `pagesPrefix` (default: `/lynq`). Routes: `/lynq/auth/{provider}/callback`, `/lynq/payment/{provider}[/callback]`, `/lynq/auth/success`, `/lynq/payment/success`. HTML templates in `src/adapters/pages.ts`. Provider value can be config object, `true` (needs secrets for github/google/stripe), or `string` (redirect).

## Out of scope

Auth implementation, database. Store implementations beyond `memoryStore()` (Redis, SQLite, etc.) are user-provided.

## When adding features

1. Can the official MCP SDK do it natively? → Don't build it. Delegate.
2. Is it needed by <80% of MCP server authors? → Middleware, not core.
3. Does it add a runtime dependency beyond `@modelcontextprotocol/sdk`? → Reject.

## Stack

TypeScript strict · ESM · tsup · vitest · Biome · pnpm · VitePress · TypeDoc

## Structure

pnpm workspace monorepo with two packages:

### `packages/lynq/` — `@lynq/lynq`

The core framework. Multiple entry points via `exports` field:
- `lynq` — core (`createMCPServer` + `memoryStore` + types + response helpers: `text()`, `json()`, `error()`, `image()`)
- `lynq/guard` — visibility gate middleware (`guard()`)
- `lynq/auth` — deprecated re-export of `guard()` as `auth()`
- `lynq/logger` — logging middleware (`logger()`)
- `lynq/rate-limit` — rate limiting middleware (`rateLimit()`)
- `lynq/truncate` — response truncation middleware (`truncate()`)
- `lynq/cache` — response caching middleware (`cache()`)
- `lynq/retry` — retry middleware (`retry()`)
- `lynq/combine` — middleware combinators (`some()`, `every()`, `except()`)
- `lynq/credentials` — form-based auth middleware (`credentials()`)
- `lynq/url-action` — URL-based elicitation middleware (`urlAction()`)
- `lynq/oauth` — OAuth flow middleware (`oauth()`)
- `lynq/payment` — payment flow middleware (`payment()`)
- `lynq/bearer` — Bearer token verification middleware (`bearer()`)
- `lynq/jwt` — JWT verification middleware (`jwt()`) — requires `jose` peer dep
- `lynq/tip` — post-result tip link appender (`tip()`)
- `lynq/store` — store utilities (`memoryStore()`, `resolveUserId()`, `createUserStore()`)
- `lynq/helpers` — public helpers (`signState`, `verifyState`, `validateHost`, `LOCALHOST_HOSTS`)
- `lynq/pages` — HTML templates + types (`successPage`, `errorPage`, `cryptoPaymentPage`, `PagesConfig`)
- `lynq/stdio` — re-export of `StdioServerTransport`
- `lynq/test` — test helpers (`createTestClient`, `matchers`)

### `packages/github/` — `@lynq/github`

GitHub OAuth provider (`github()`, `handleCallback()`). Depends on `@lynq/lynq`.

### `packages/google/` — `@lynq/google`

Google OAuth provider (`google()`, `handleCallback()`). Depends on `@lynq/lynq`.

### `packages/stripe/` — `@lynq/stripe`

Stripe Checkout payment provider (`stripe()`, `handleCallback()`). Peer dep: `stripe`.

### `packages/crypto/` — `@lynq/crypto`

Crypto payment provider (`crypto()`, `handleCallback()`). Depends on `@lynq/lynq`.

### `packages/hono/` — `@lynq/hono`

Hono adapter (`mountLynq`). Peer dep: `hono`. Optional peer deps: `@lynq/github`, `@lynq/google`, `@lynq/stripe`, `@lynq/crypto` (for `pages` option).

### `packages/express/` — `@lynq/express`

Express adapter (`mountLynq`). Peer dep: `express`. Optional peer deps: `@lynq/github`, `@lynq/google`, `@lynq/stripe`, `@lynq/crypto` (for `pages` option).

### `packages/store-redis/` — `@lynq/store-redis`

Redis-backed Store implementation (`redisStore()`). Peer dep: `ioredis`.

### `packages/store-sqlite/` — `@lynq/store-sqlite`

SQLite-backed Store implementation (`sqliteStore()`). Peer dep: `better-sqlite3`.

### `packages/create-lynq/` — `create-lynq`

CLI scaffold tool. `npm create lynq` / `pnpm create lynq`. Zero runtime dependencies. Templates: minimal, hono, full.

```
packages/
├── lynq/
│   ├── src/
│   │   ├── index.ts          — public exports
│   │   ├── types.ts          — all type definitions
│   │   ├── core.ts           — createMCPServer + state management + request handlers
│   │   ├── handlers.ts       — request handlers (tools/list, tools/call, resources, tasks)
│   │   ├── response.ts       — response helpers (text, json, error, image)
│   │   ├── store.ts          — memoryStore, resolveUserId, createUserStore
│   │   ├── test.ts           — test helpers (createTestClient, matchers)
│   │   ├── helpers.ts        — pure functions (isVisible, buildMiddlewareChain, signState, verifyState, validateHost, etc.)
│   │   ├── public-helpers.ts — thin re-export for lynq/helpers subpath
│   │   ├── pages.ts          — HTML templates + types for adapter pages
│   │   ├── context.ts        — context factories (createElicit, createRootsAccessor, createSample, createToolContext)
│   │   ├── internal-types.ts — internal interfaces (InternalTool, InternalResource, etc.)
│   │   ├── middleware/
│   │   │   ├── guard.ts        — guard() visibility gate
│   │   │   ├── auth.ts         — deprecated re-export of guard()
│   │   │   ├── logger.ts       — logger() middleware
│   │   │   ├── rate-limit.ts   — rateLimit() middleware
│   │   │   ├── truncate.ts     — truncate() middleware
│   │   │   ├── cache.ts        — cache() middleware
│   │   │   ├── retry.ts        — retry() middleware
│   │   │   ├── combine.ts      — some() / every() / except()
│   │   │   ├── credentials.ts  — credentials() form mode auth
│   │   │   ├── url-action.ts   — urlAction() URL-based elicitation
│   │   │   ├── oauth.ts        — oauth() flow middleware
│   │   │   ├── payment.ts      — payment() flow middleware
│   │   │   ├── bearer.ts       — bearer() token verification
│   │   │   ├── jwt.ts          — jwt() JWT verification
│   │   │   └── tip.ts          — tip() onResult middleware
│   │   └── adapters/
│   │       └── stdio.ts      — stdio transport re-export
│   ├── tests/
│   └── example/
│
├── github/               — @lynq/github
│   ├── src/index.ts      — github() + handleCallback()
│   └── tests/
├── google/               — @lynq/google
│   ├── src/index.ts      — google() + handleCallback()
│   └── tests/
├── stripe/               — @lynq/stripe
│   ├── src/index.ts      — stripe() + handleCallback()
│   └── tests/
├── crypto/               — @lynq/crypto
│   ├── src/index.ts      — crypto() + handleCallback()
│   └── tests/
├── hono/                 — @lynq/hono
│   ├── src/index.ts      — mountLynq + page handlers
│   └── tests/
├── express/              — @lynq/express
│   ├── src/index.ts      — mountLynq + page handlers
│   └── tests/
├── store-redis/          — @lynq/store-redis
│   └── src/index.ts      — redisStore()
├── store-sqlite/         — @lynq/store-sqlite
│   └── src/index.ts      — sqliteStore()
│
├── create-lynq/
│   ├── src/
│   │   └── index.ts      — CLI entry point
│   └── templates/
│       ├── minimal/       — stdio + 1 tool
│       ├── hono/          — Hono HTTP + guard + auth flow
│       └── full/          — GitHub OAuth + Stripe + Store + tests
│
docs/                      — VitePress (root-level)
├── index.md              — VitePress landing page
├── why-lynq.md
├── api/overview.md
├── getting-started/      — quick-start, mcp-overview, claude-code, with-hono, with-express
├── concepts/             — middleware, session-and-visibility, elicitation, sampling, tasks, transports
├── guides/               — auth-flow, dynamic-tools, resource-gating, custom-middleware, middleware-recipes, testing
├── api-reference/        — auto-generated by TypeDoc (gitignored)
└── .vitepress/config.ts  — VitePress configuration
```
