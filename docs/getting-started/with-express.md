# With Express

Deploy your MCP server over HTTP using Express.

## Install

```sh
npm install @lynq/lynq @modelcontextprotocol/sdk zod express
```

## Usage

```ts
import express from "express";
import { createMCPServer } from "@lynq/lynq";
import { mountLynq } from "@lynq/lynq/express";
import { z } from "zod";

const server = createMCPServer({ name: "my-server", version: "1.0.0" });

server.tool(
  "add",
  {
    description: "Add two numbers",
    input: z.object({ a: z.number(), b: z.number() }),
  },
  (args, ctx) => ctx.text(String(args.a + args.b)),
);

const app = express();
app.use(express.json());
mountLynq(app, server);

app.listen(3000);
```

> **Note:** Express must have a JSON body parser registered before `mountLynq`. The adapter re-serializes `req.body` into a Web Standard `Request`, so the body must already be parsed.

:::tip Under the hood
The Express adapter converts Express `req`/`res` objects into a Web Standard `Request`, passes it to `server.http()`, then streams the `Response` back. This means Express is a thin wrapper -- the real MCP logic uses the same Web Standard handler as Hono, Deno, and every other runtime.
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

## Next Steps

- [Transports](/concepts/transports) -- stateful vs sessionless, runtime examples
- [Claude Code](/getting-started/claude-code) -- connect Claude Code to your HTTP server
