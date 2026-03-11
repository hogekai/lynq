# lynq

[![CI](https://github.com/hogekai/lynq/actions/workflows/ci.yml/badge.svg)](https://github.com/hogekai/lynq/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@lynq/lynq)](https://www.npmjs.com/package/@lynq/lynq)

MCP servers are stateless by default. lynq makes them session-aware.

```ts
server.tool("login", config, handler);            // always visible
server.tool("weather", guard(), config, handler);  // hidden until authorized
// Client gets notified automatically. No manual wiring.
```

## Install

```sh
npm install @lynq/lynq
```

## Quick Start

```ts
// server.ts
import { createMCPServer } from "@lynq/lynq";
import { guard } from "@lynq/lynq/guard";
import { z } from "zod";

const server = createMCPServer({ name: "my-server", version: "1.0.0" });

server.tool("login", {
  input: z.object({ username: z.string(), password: z.string() }),
}, async (args, ctx) => {
  const user = await authenticate(args.username, args.password);
  ctx.session.set("user", user);
  ctx.session.authorize("guard");
  return ctx.text(`Welcome, ${user.name}`);
});

server.tool("weather", guard(), {
  description: "Get weather for a city",
  input: z.object({ city: z.string() }),
}, async (args, ctx) => {
  return ctx.text(JSON.stringify(await fetchWeather(args.city)));
});

await server.stdio();
```

```sh
npx tsx server.ts
```

## Features

- **Session-Scoped Visibility** — `authorize()` shows tools, `revoke()` hides them. Client notification is automatic.
- **Hono-Style Middleware** — Global via `server.use()`, per-tool inline. Three hooks: `onRegister`, `onCall`, `onResult`.
- **Built-in Middleware** — `guard()` `rateLimit()` `logger()` `truncate()` `credentials()` `some()` `every()` `except()`
- **Framework Adapters** — `server.http()` returns `(Request) => Response`. Mount in Hono, Express, Deno, Workers.
- **Test Helpers** — `createTestClient()` for in-memory testing. No transport setup.
- **Tiny Core** — One dependency. ESM only. No config files, no magic.

## Middleware Composition

```ts
import { guard } from "@lynq/lynq/guard";
import { rateLimit } from "@lynq/lynq/rate-limit";
import { logger } from "@lynq/lynq/logger";

server.use(logger());                                              // global
server.tool("search", guard(), rateLimit({ max: 10 }), config, handler);  // per-tool stack
```

## Comparison

| | lynq | FastMCP | Official SDK |
|---|---|---|---|
| Per-tool middleware | Yes | No | No |
| Session-scoped visibility | Auto-notify | Manual | Manual |
| onResult hook | Yes | No | No |
| Test helpers | Yes | No | No |
| HTTP server built-in | No (you choose) | Yes (opinionated) | No |

## Documentation

[https://hogekai.github.io/lynq/](https://hogekai.github.io/lynq/)

- [Quick Start](https://hogekai.github.io/lynq/getting-started/quick-start)
- [Middleware Concepts](https://hogekai.github.io/lynq/concepts/middleware)
- [Why lynq](https://hogekai.github.io/lynq/why-lynq)
- [API Reference](https://hogekai.github.io/lynq/api-reference/)

## License

MIT
