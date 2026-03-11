# Why lynq

MCP is bidirectional -- servers can push tool list changes to clients at any time. This makes session-aware tool visibility possible: show tools after login, hide them on logout, gate features per user. But wiring the `tools/list_changed` notification by hand is tedious. lynq absorbs that plumbing.

## Before & After

Without lynq, you manage sessions, filter tool lists, and send notifications manually:

```ts
// Without lynq
const sessions = new Map();

server.setRequestHandler(ListToolsRequestSchema, (req, extra) => {
  const session = sessions.get(extra.sessionId);
  const tools = [loginTool];
  if (session?.authorized) tools.push(weatherTool);
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
  if (req.params.name === "login") {
    sessions.set(extra.sessionId, { authorized: true });
    server.sendToolListChanged(); // don't forget this
  }
  // ... handler logic
});
```

With lynq, one middleware call replaces all of that:

```ts
// With lynq
server.tool("login", config, async (args, c) => {
  c.session.authorize("guard");
  return c.text("Logged in");
});

server.tool("weather", guard(), config, handler);
// Client gets notified automatically.
```

## Comparison

| | lynq | FastMCP | Official SDK |
|---|---|---|---|
| Core size | ~680 lines | ~3,400 lines | N/A |
| Per-tool middleware | 3 hooks | No | No |
| Session-scoped visibility | Auto-notify | Manual | Manual |
| Built-in auth providers | GitHub, Google, JWT, Bearer, Credentials | No | No |
| Built-in payment providers | Stripe, Crypto, Tip | No | No |
| Persistent store | Pluggable | No | No |
| Default pages (OAuth/Payment UI) | Via adapters | No | No |
| Response helpers | Chainable | Basic | No |
| Test helpers | Yes | No | No |
| HTTP server built-in | No (you choose) | Yes (opinionated) | No |

## When to Use lynq

- You want tools to appear/disappear based on session state (auth, roles, onboarding steps).
- You want per-tool middleware (rate limiting, logging, caching) without global interceptors.
- You want OAuth (GitHub, Google) and payment (Stripe, crypto) built into your MCP server with minimal code.
- You want persistent user state across sessions via a pluggable Store.
- You want to test tools in-memory without setting up transports.
- You want a standard `(Request) => Response` handler you can mount anywhere.

## What lynq is NOT

- **Not an HTTP server.** `server.http()` returns a handler. You mount it on Hono, Express, Deno, Workers.
- **Not a database.** lynq provides a pluggable `Store` interface (`get`/`set`/`delete`). You bring your own Redis, SQLite, or KV. `memoryStore()` is the default (in-process, lost on restart).
- **Not an auth framework.** `github()`, `stripe()`, `credentials()` are ToolMiddleware objects that compose with `guard()`, `rateLimit()`, `combine()` like any other middleware. No separate auth subsystem.

## Design Decisions

- **Delegate, don't wrap.**
  If the official MCP SDK already has the API, use it. Schema conversion delegates to `toJsonSchemaCompat`. Elicitation delegates to `server.elicitInput()`. lynq never reimplements what the SDK provides.

- **No built-in HTTP server.**
  `server.http()` returns `(req: Request) => Promise<Response>`. Mount it in Hono, Express, Deno.serve, Cloudflare Workers -- whatever you already use. Optional adapters (`lynq/hono`, `lynq/express`) add one-line mounting with DNS rebinding protection.

- **Auth and payments are middleware, not frameworks.**
  `github()`, `stripe()`, `crypto()` are ToolMiddleware objects. They compose with `guard()`, `rateLimit()`, `combine()` like any other middleware. No separate auth subsystem.

- **Pages are adapter-scoped.**
  Default OAuth callback and payment pages live in `lynq/hono` and `lynq/express`, not in core. Core has zero knowledge of HTML. You opt in per provider.

- **Store is an interface.**
  `memoryStore()` ships as default. Redis, SQLite, KV are user-provided. lynq never imports a database driver.

- **One runtime dependency.**
  `@modelcontextprotocol/sdk` as a direct dependency. Nothing else in core. Framework types (`hono`, `express`) are peer deps of their respective adapters. The dependency tree stays flat.

- **Types are the docs.**
  If the API isn't obvious from type signatures alone, the API needs redesigning -- not more documentation. Every middleware hook, every context property, every handler signature is fully typed.

- **Design heritage.**
  lynq follows the same philosophy as [vide](https://github.com/hogekai/vide): defaults are minimal, extensions are explicit, nothing is implicit. `createMCPServer(info)` is the entire API surface -- no config files, no directory scanning, no magic.
