# Hono

Deploy your MCP server over HTTP using Hono.

## Install

::: code-group

```sh [pnpm]
pnpm add @lynq/lynq @lynq/hono zod hono
```

```sh [npm]
npm install @lynq/lynq @lynq/hono zod hono
```

```sh [yarn]
yarn add @lynq/lynq @lynq/hono zod hono
```

```sh [bun]
bun add @lynq/lynq @lynq/hono zod hono
```

:::

## Usage

```ts
import { Hono } from "hono";
import { createMCPServer } from "@lynq/lynq";
import { mountLynq } from "@lynq/hono";
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

## Pages

Auto-register OAuth callback and payment page routes. Specify only the providers you use:

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
// Registers:
//   GET /lynq/auth/github/callback
//   GET /lynq/payment/crypto
//   POST /lynq/payment/crypto/callback
//   GET /lynq/auth/success
//   GET /lynq/payment/success
```

Unspecified providers are not registered. Success pages are shared across all providers.

### Provider Config

| Provider | Config | Routes |
|---|---|---|
| `github` | `{ clientId, clientSecret }` | `GET /lynq/auth/github/callback` |
| `google` | `{ clientId, clientSecret }` | `GET /lynq/auth/google/callback` |
| `stripe` | `{ secretKey }` | `GET /lynq/payment/stripe/callback` |
| `crypto` | `true` or `{ rpcUrl? }` | `GET /lynq/payment/crypto` + `POST /lynq/payment/crypto/callback` |

Each provider value can also be a `string` to redirect to a custom URL instead of using the default page.

### `pagesPrefix`

URL prefix for all pages routes. Defaults to `"/lynq"`.

```ts
mountLynq(app, server, {
  pages: { github: { clientId: "...", clientSecret: "..." } },
  pagesPrefix: "/my-app",
  // → GET /my-app/auth/github/callback
});
```

## Next Steps

- [HTTP](/adapters/http) -- raw `server.http()` API, runtime examples
- [Express](/adapters/express) -- Express adapter
- [Transports](/concepts/transports) -- stateful vs sessionless
- [Claude Code](/getting-started/claude-code) -- connect Claude Code to your HTTP server
