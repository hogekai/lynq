# Why lynq

MCP is bidirectional -- servers can push tool list changes to clients at any time. This makes session-aware tool visibility possible: show tools after login, hide them on logout, gate features per user. But wiring the `tools/list_changed` notification by hand is tedious. lynq absorbs that plumbing. You declare visibility rules as Hono-style middleware, and lynq handles the protocol-level notifications internally. `server.tool("weather", auth(), config, handler)` -- done.

## Comparison

| | lynq | FastMCP | Official SDK |
|---|---|---|---|
| Core size | ~680 lines | ~3,400 lines | N/A |
| Per-tool middleware | Yes | No | No |
| Session-scoped visibility | Auto-notify | Manual | Manual |
| HTTP server built-in | No (you choose) | Yes (opinionated) | No |
| Test helpers | Yes | No | No |
| onResult hook | Yes | No | No |

## Design Decisions

- **No built-in HTTP server.**
  lynq's `server.http()` returns a `(req: Request) => Promise<Response>` handler. Mount it in Hono, Express, Deno.serve, Cloudflare Workers -- whatever you already use. lynq doesn't pick your HTTP framework; you do. Optional adapters (`@lynq/lynq/hono`, `@lynq/lynq/express`) add one-line mounting with DNS rebinding protection.

- **Schema conversion is delegated to the SDK.**
  The official `@modelcontextprotocol/sdk` already converts Zod schemas to JSON Schema via `toJsonSchemaCompat`. lynq calls it internally and never parses schemas itself. If the SDK improves its conversion, lynq gets the improvement for free.

- **Design heritage.**
  lynq follows the same philosophy as [vide](https://github.com/nicepkg/vide): defaults are minimal, extensions are explicit, nothing is implicit. `createMCPServer(info)` is the entire API surface -- no config files, no directory scanning, no magic. Middleware is opt-in per tool, not a global interceptor you have to fight.

- **One runtime dependency.**
  `@modelcontextprotocol/sdk` as a peer dependency. Nothing else in core. Framework types (`hono`, `express`) are peer deps of their respective adapters. The dependency tree stays flat.

- **Types are the docs.**
  If the API isn't obvious from the type signatures in `types.ts`, the API needs redesigning -- not more documentation. Every middleware hook, every context property, every handler signature is fully typed with no `any` escape hatches in the public API.
