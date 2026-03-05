# lynq

Lightweight MCP server framework. Tool visibility control through middleware.

## Philosophy

Think Deno, not webpack, Think Hono, not Express. Think vide (../vide), not video.js. Defaults are minimal. Extensions are explicit. Nothing implicit.

## Rules

- **Delegate, don't wrap.** If the official MCP SDK already has the API, use it.
- **Pure functions over stateful objects.** Middleware factories return plain objects. No classes.
- **ESM only.** No CJS. `sideEffects: false`.
- **Types are the docs.** If the API isn't obvious from type signatures alone, redesign the API.
- **Dependency direction: one way.** Middleware → core. Never reverse. Never circular.
- **One runtime dependency.** `@modelcontextprotocol/sdk` as peer dep. Nothing else in core.
- **`createMCPServer(info)` is the entire API surface.** No config files, no directory scanning.
- **Middleware is Hono-style.** Global via `server.use(middleware)`. Per-tool via `server.tool("name", middleware, schema, handler)`. Both supported.
- **Tool visibility is session-scoped.** Middleware controls initial visibility. `ctx.session.authorize()` / `ctx.session.revoke()` change it at runtime. Bidirectional notification is internal — users never touch it.
- **ctx follows Hono's Context pattern.** `ctx.session.set()` / `ctx.session.get()`.
- **Framework does NOT handle:** HTTP server, auth implementation, database, session persistence.

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
├── schema.ts         — Zod-to-JSON-Schema conversion
├── middleware/
│   └── auth.ts       — auth() middleware
└── adapters/
    └── stdio.ts      — stdio transport re-export
tests/
├── core.test.ts
└── middleware/
    └── auth.test.ts
```
