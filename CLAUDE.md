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

## Out of scope

HTTP server, auth implementation, database, session persistence.

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

```
src/
├── index.ts          — public exports
├── types.ts          — all type definitions
├── core.ts           — createMCPServer implementation
├── middleware/
│   └── auth.ts       — auth() middleware
└── adapters/
    └── stdio.ts      — stdio transport re-export
tests/
├── core.test.ts
├── resource.test.ts
├── task.test.ts
└── middleware/
    └── auth.test.ts
```
