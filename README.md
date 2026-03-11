# lynq

[![CI](https://github.com/hogekai/lynq/actions/workflows/ci.yml/badge.svg)](https://github.com/hogekai/lynq/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@lynq/lynq)](https://www.npmjs.com/package/@lynq/lynq)

MCP servers are stateless by default. lynq makes them session-aware.

## The Problem

With the official SDK, adding session-aware tool visibility requires manual plumbing:

```ts
// Without lynq — manual session tracking, manual notifications
const sessions = new Map();

server.setRequestHandler(ListToolsRequestSchema, (req, extra) => {
  const session = sessions.get(extra.sessionId);
  const tools = [loginTool];
  if (session?.authorized) tools.push(weatherTool); // manual filtering
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
  if (req.params.name === "login") {
    sessions.set(extra.sessionId, { authorized: true });
    server.sendToolListChanged(); // manual notification
  }
  // ...
});
```

## The Solution

```ts
// With lynq — one line
server.tool("weather", guard(), config, handler);
// Client gets notified automatically. No manual wiring.
```

## Install

```sh
npm install @lynq/lynq
```

## Quick Start

```ts
import { createMCPServer } from "@lynq/lynq";
import { guard } from "@lynq/lynq/guard";
import { z } from "zod";

const server = createMCPServer({ name: "my-server", version: "1.0.0" });

server.tool("login", {
  input: z.object({ username: z.string(), password: z.string() }),
}, async (args, c) => {
  const user = await authenticate(args.username, args.password);
  c.session.set("user", user);
  c.session.authorize("guard");
  return c.text(`Welcome, ${user.name}`);
});

server.tool("weather", guard(), {
  description: "Get weather for a city",
  input: z.object({ city: z.string() }),
}, async (args, c) => {
  return c.text(JSON.stringify(await fetchWeather(args.city)));
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
- **Response Helpers** — `c.text()` `c.json()` `c.error()` `c.image()` — chainable: `c.text("done").json({ id: 1 })`
- **Elicitation** — `c.elicit.form(message, zodSchema)` for structured user input. `c.elicit.url()` for external flows.
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
| Response helpers | Chainable | Basic | No |
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
