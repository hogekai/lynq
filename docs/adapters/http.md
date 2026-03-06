# HTTP Transport

`server.http()` returns a Web Standard request handler with the signature `(req: Request) => Promise<Response>`. This makes it compatible with any runtime or framework that supports the Fetch API `Request`/`Response` types.

## Basic Usage

```ts
import { createMCPServer } from "@lynq/lynq";

const server = createMCPServer({ name: "my-server", version: "1.0.0" });

// Register tools...

const handler = server.http();
```

## Runtime Examples

### Hono

```ts
app.all("/mcp", (c) => handler(c.req.raw));
```

### Deno

```ts
Deno.serve(handler);
```

### Bun

```ts
Bun.serve({ fetch: handler });
```

### Cloudflare Workers

```ts
export default { fetch: handler };
```

## Options

```ts
// Sessionless mode — new server per request, no state persistence
server.http({ sessionless: true });

// Custom session ID generator
server.http({ sessionIdGenerator: () => crypto.randomUUID() });

// JSON responses instead of SSE streams
server.http({ enableJsonResponse: true });
```

### `sessionless`

When `false` (default), the server is **stateful**: each client gets a persistent session identified by the `Mcp-Session-Id` header, and tool visibility changes are pushed via bidirectional notifications.

When `true`, the server is **sessionless**: a fresh server and transport are created for every request, with no session persistence between calls.

### `sessionIdGenerator`

Override the default `crypto.randomUUID()` with a custom function. Only applies in stateful mode.

### `enableJsonResponse`

When `true`, the server responds with JSON payloads instead of SSE streams.

## Stateful vs Sessionless

- **Stateful** (default): per-session state, tool visibility changes push to the client in real time.
- **Sessionless**: no state between requests, suitable for simple stateless APIs or edge deployments.
