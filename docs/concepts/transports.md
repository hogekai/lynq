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

### Stateful (default)

Each client session is identified by the `Mcp-Session-Id` header. The server maintains a dedicated `Server` + `Transport` pair per session in an internal map.

- Session state persists across requests.
- `authorize()` / `revoke()` pushes tool list changes to the client in real time via SSE.
- Middleware instances are shared across calls within a session.

This is the right mode when you need session-scoped visibility, auth flows, or stateful middleware (rate limiting, caching).

**Memory consideration:** Each active session holds a `Server` instance, a `Transport`, and session data in memory. For long-running servers, sessions accumulate until the client disconnects. Monitor session count in production.

### Sessionless

```ts
const handler = server.http({ sessionless: true });
```

A fresh `Server` + `Transport` is created for every request and discarded after. No state between calls.

- No `Mcp-Session-Id` header.
- No tool list change notifications (no persistent connection).
- Each request is isolated.

Use for stateless APIs, edge deployments (Cloudflare Workers, Lambda@Edge), or when clients don't need session-aware features.

### When to Choose

| | Stateful | Sessionless |
|---|---|---|
| Tool visibility changes | Yes | No |
| Auth flows | Yes | No |
| Rate limiting | Per-session | Per-request only |
| Edge deployment | Needs sticky sessions | Works anywhere |
| Memory usage | Grows with sessions | Constant |

:::tip Under the hood
`server.http()` lazy-imports `WebStandardStreamableHTTPServerTransport` from the MCP SDK. In stateful mode, the `onsessioninitialized` callback stores the Server+Transport pair in the internal map. In sessionless mode, `sessionIdGenerator` is set to `undefined`, which tells the SDK transport to skip session management entirely.
:::
