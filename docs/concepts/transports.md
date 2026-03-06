# Transports

lynq supports two transports: stdio for local development, HTTP for production.

## Stdio

```ts
await server.stdio();
```

The client spawns your server as a child process and communicates over stdin/stdout. Use for local development, Claude Desktop, Claude Code, and CLI tools.

## HTTP

`server.http()` returns a Web Standard request handler:

```ts
const handler = server.http();
// handler: (req: Request) => Promise<Response>
```

Mount it on any runtime:

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

Or use the framework adapters for batteries-included setup:

- [With Hono](/getting-started/with-hono) -- `mountLynq(app, server)`
- [With Express](/getting-started/with-express) -- `mountLynq(app, server)`

## HTTP Options

```ts
server.http({ sessionless: true });
server.http({ sessionIdGenerator: () => crypto.randomUUID() });
server.http({ enableJsonResponse: true });
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sessionless` | `boolean` | `false` | New server+transport per request |
| `sessionIdGenerator` | `() => string` | `crypto.randomUUID()` | Custom session ID generator |
| `enableJsonResponse` | `boolean` | `false` | Return JSON instead of SSE streams |

## Stateful vs Sessionless

- **Stateful** (default): Each client gets a persistent session identified by the `Mcp-Session-Id` header. Tool visibility changes push to the client in real time.
- **Sessionless**: A fresh server and transport are created for every request. No state between calls. Suitable for stateless APIs or edge deployments.

lynq does not include an HTTP server. It returns a standard `(req: Request) => Promise<Response>` handler that you mount in Hono, Express, Deno.serve, or any other framework.

:::tip Under the hood
`server.http()` lazy-imports `WebStandardStreamableHTTPServerTransport` from the MCP SDK. In stateful mode, each unique `Mcp-Session-Id` header gets a dedicated Server+Transport pair stored in an internal map. In sessionless mode, a fresh Server+Transport is created per request and discarded after. The transport handles SSE streaming, JSON responses, and session management internally.
:::
