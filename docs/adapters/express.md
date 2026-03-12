# Express

Deploy your MCP server over HTTP using Express.

## Install

::: code-group

```sh [pnpm]
pnpm add @lynq/lynq @lynq/express zod express
```

```sh [npm]
npm install @lynq/lynq @lynq/express zod express
```

```sh [yarn]
yarn add @lynq/lynq @lynq/express zod express
```

```sh [bun]
bun add @lynq/lynq @lynq/express zod express
```

:::

## Usage

```ts
import express from "express";
import { createMCPServer } from "@lynq/lynq";
import { mountLynq } from "@lynq/express";
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

## Pages

Auto-register OAuth callback and payment page routes. Same API as the [Hono adapter](/adapters/hono#pages):

```ts
mountLynq(app, server, {
  pages: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    crypto: true,
  },
});
```

> **Note:** The crypto payment POST callback requires `express.json()` middleware, which must be registered before `mountLynq`.

See [Hono — Pages](/adapters/hono#pages) for the full provider config table and `pagesPrefix` option.

## Next Steps

- [HTTP](/adapters/http) -- raw `server.http()` API, runtime examples
- [Hono](/adapters/hono) -- Hono adapter
- [Transports](/concepts/transports) -- stateful vs sessionless
- [Claude Code](/getting-started/claude-code) -- connect Claude Code to your HTTP server
