# Express Adapter

The Express adapter mounts your MCP server onto an Express app with DNS rebinding protection included by default.

## Install

```bash
npm install express
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
  (args) => ({
    content: [{ type: "text", text: String(args.a + args.b) }],
  }),
);

const app = express();
app.use(express.json());
mountLynq(app, server);

app.listen(3000);
```

> **Note:** Express must have a JSON body parser registered before `mountLynq`. The adapter re-serializes `req.body` into a Web Standard `Request`, so the body must already be parsed. Use `express.json()` or an equivalent middleware.

## DNS Rebinding Protection

`mountLynq` validates the `Host` header against a list of allowed hostnames, blocking DNS rebinding attacks on localhost servers. Enabled by default with `["localhost", "127.0.0.1", "::1"]`.

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
