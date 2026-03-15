# @lynq/hono

[Hono](https://hono.dev) framework adapter for [lynq](https://www.npmjs.com/package/@lynq/lynq) MCP framework.

## Install

```sh
npm install @lynq/hono @lynq/lynq hono
```

## Usage

```ts
import { Hono } from "hono";
import { createMCPServer } from "@lynq/lynq";
import { mountLynq } from "@lynq/hono";

const app = new Hono();
const server = createMCPServer({ name: "my-server", version: "1.0.0" });

// Register tools on server...

mountLynq(app, server);
// MCP endpoint is now available at POST /mcp

export default app;
```

### With OAuth/payment pages

```ts
mountLynq(app, server, {
  pages: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    stripe: { secretKey: process.env.STRIPE_SECRET_KEY! },
    crypto: true,
  },
});
// Auto-registers callback routes under /lynq/
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `path` | `string` | `"/mcp"` | Route path for MCP endpoint |
| `allowedHosts` | `string[]` | localhost variants | DNS rebinding protection |
| `pages` | `PagesConfig` | — | Enable auth/payment callback pages |
| `pagesPrefix` | `string` | `"/lynq"` | URL prefix for pages routes |

### Auto-registered routes (when `pages` is set)

- `/lynq/auth/{github,google}/callback` — OAuth callbacks
- `/lynq/payment/stripe/callback` — Stripe callback
- `/lynq/payment/crypto` — Crypto payment page (GET + POST)
- `/lynq/auth/success` — Auth success page
- `/lynq/payment/success` — Payment success page

## Documentation

[https://hogekai.github.io/lynq/](https://hogekai.github.io/lynq/)

## License

MIT
