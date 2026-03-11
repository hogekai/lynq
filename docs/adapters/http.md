# HTTP

`server.http()` returns a Web Standard request handler:

```ts
const handler = server.http();
// (req: Request) => Promise<Response>
```

Mount it on any runtime. For Hono and Express, use the dedicated [adapters](/adapters/hono).

## Runtimes

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
server.http({ sessionless: true });
server.http({ sessionIdGenerator: () => crypto.randomUUID() });
server.http({ enableJsonResponse: true });
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sessionless` | `boolean` | `false` | New server+transport per request |
| `sessionIdGenerator` | `() => string` | `crypto.randomUUID()` | Custom session ID generator |
| `enableJsonResponse` | `boolean` | `false` | Return JSON instead of SSE streams |
| `onRequest` | `(req, sessionId, session) => void \| Promise<void>` | — | Called on each request after session is resolved |

## onRequest Hook

Runs on every HTTP request after the session is resolved. Use it to inject HTTP-layer data (auth headers, cookies) into MCP sessions:

```ts
const handler = server.http({
  onRequest(req, sessionId, session) {
    const auth = req.headers.get("Authorization");
    if (auth?.startsWith("Bearer ")) {
      session.set("token", auth.slice(7));
    }
  },
});
```

This bridges HTTP and MCP -- middleware like `bearer()` and `jwt()` can then read the token from the session without knowing about HTTP headers.

## Stateful vs Sessionless

### Stateful (default)

Each client session is identified by the `Mcp-Session-Id` header. The server maintains a dedicated `Server` + `Transport` pair per session.

- Session state persists across requests.
- `authorize()` / `revoke()` pushes tool list changes via SSE.
- Middleware instances are shared across calls within a session.

**Memory consideration:** Each active session holds a `Server` instance, a `Transport`, and session data in memory. Monitor session count in production.

### Sessionless

```ts
const handler = server.http({ sessionless: true });
```

A fresh `Server` + `Transport` per request. No state between calls.

- No `Mcp-Session-Id` header.
- No tool list change notifications.
- Each request is isolated.

Use for stateless APIs and edge deployments (Cloudflare Workers, Lambda@Edge).

### When to Choose

| | Stateful | Sessionless |
|---|---|---|
| Tool visibility changes | Yes | No |
| Auth flows | Yes | No |
| Rate limiting | Per-session | Per-request only |
| Edge deployment | Needs sticky sessions | Works anywhere |
| Memory usage | Grows with sessions | Constant |

:::tip Under the hood
`server.http()` lazy-imports `WebStandardStreamableHTTPServerTransport` from the MCP SDK. In stateful mode, the `onsessioninitialized` callback stores the Server+Transport pair in an internal map. In sessionless mode, `sessionIdGenerator` is set to `undefined`, which tells the SDK transport to skip session management entirely.
:::
