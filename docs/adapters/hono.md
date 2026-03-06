# Hono Adapter

The Hono adapter mounts your MCP server onto a Hono app with DNS rebinding protection included by default.

## Install

```bash
npm install hono
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
  (args) => ({
    content: [{ type: "text", text: String(args.a + args.b) }],
  }),
);

const app = new Hono();
mountLynq(app, server);

export default app;
```

## DNS Rebinding Protection

`mountLynq` validates the `Host` header against a list of allowed hostnames. This is enabled by default and blocks requests from unexpected origins, preventing DNS rebinding attacks on localhost servers. Allowed hosts default to `["localhost", "127.0.0.1", "::1"]`.

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
