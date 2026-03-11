# Hono

Deploy your MCP server over HTTP using Hono.

## Install

```sh
npm install @lynq/lynq zod hono
```

## Usage

```ts
import { Hono } from "hono";
import { createMCPServer } from "@lynq/lynq";
import { mountLynq } from "@lynq/lynq/hono";
import { z } from "zod";

const server = createMCPServer({ name: "my-server", version: "1.0.0" });

server.tool(
  "add",
  {
    description: "Add two numbers",
    input: z.object({ a: z.number(), b: z.number() }),
  },
  (args, c) => c.text(String(args.a + args.b)),
);

const app = new Hono();
mountLynq(app, server);

export default app;
```

The MCP endpoint is mounted at `/mcp` by default.

:::tip Under the hood
`mountLynq` calls `server.http()` internally to get a Web Standard `(req: Request) => Promise<Response>` handler, then wires it into Hono's routing. DNS rebinding protection is included by default -- the `Host` header is validated against allowed hostnames to prevent attacks on localhost servers.
:::

## Options

```ts
mountLynq(app, server, {
  // Route path (default: "/mcp")
  path: "/mcp",

  // Override allowed hostnames for Host header validation
  allowedHosts: ["localhost", "127.0.0.1", "::1"],
});
```

### `path`

The route path where the MCP endpoint is mounted. Defaults to `"/mcp"`.

### `allowedHosts`

Array of hostnames accepted in the `Host` header. Defaults to `["localhost", "127.0.0.1", "::1"]`. Set to your production domain when deploying publicly.

## Coexisting with Hono Middleware

Standard Hono middleware works alongside `mountLynq`. Apply middleware before mounting:

```ts
import { cors } from "hono/cors";
import { logger } from "hono/logger";

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

mountLynq(app, server);

export default app;
```

## Next Steps

- [HTTP](/adapters/http) -- raw `server.http()` API, runtime examples
- [Express](/adapters/express) -- Express adapter
- [Transports](/concepts/transports) -- stateful vs sessionless
- [Claude Code](/getting-started/claude-code) -- connect Claude Code to your HTTP server
