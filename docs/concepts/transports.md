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

- [Hono](/adapters/hono) -- `mountLynq(app, server)`
- [Express](/adapters/express) -- `mountLynq(app, server)`

For full HTTP options, stateful vs sessionless, and the `onRequest` hook, see [HTTP Adapter](/adapters/http).

## What's Next

- [Hono Adapter](/adapters/hono) -- batteries-included Hono setup
- [Express Adapter](/adapters/express) -- batteries-included Express setup
- [HTTP (raw)](/adapters/http) -- full `server.http()` API reference
