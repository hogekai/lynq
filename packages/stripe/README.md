# @lynq/stripe

Stripe Checkout payment provider for [lynq](https://www.npmjs.com/package/@lynq/lynq) MCP framework.

## Install

```sh
npm install @lynq/stripe @lynq/lynq stripe
```

## Usage

```ts
import { createMCPServer } from "@lynq/lynq";
import { stripe } from "@lynq/stripe";

const server = createMCPServer({ name: "my-server", version: "1.0.0" });

server.tool("premium-feature", stripe({
  secretKey: process.env.STRIPE_SECRET_KEY!,
  baseUrl: "http://localhost:3000",
  amount: 500, // $5.00
  description: "Premium feature access",
}), {
  description: "A paid feature",
}, async (args, c) => {
  return c.text("Premium content here");
});
```

### With Hono adapter

```ts
import { mountLynq } from "@lynq/hono";

mountLynq(app, server, {
  pages: {
    stripe: { secretKey: process.env.STRIPE_SECRET_KEY! },
  },
});
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `secretKey` | `string` | required | Stripe secret key |
| `baseUrl` | `string` | required | Base URL for callback |
| `amount` | `number` | required | Amount in cents (e.g. 500 = $5.00) |
| `currency` | `string` | `"usd"` | Currency code |
| `description` | `string` | — | Product description |
| `callbackPath` | `string` | `"/payment/stripe/callback"` | Callback route path |
| `sessionKey` | `string` | `"payment"` | Session key for payment state |
| `once` | `boolean` | `false` | Only charge once per session |
| `message` | `string` | — | Elicitation message |
| `timeout` | `number` | `300000` | Elicitation timeout (ms) |
| `skipIf` | `(c) => boolean` | — | Skip middleware conditionally |
| `onComplete` | `(c) => void` | — | Run after successful payment |

## Documentation

[https://hogekai.github.io/lynq/](https://hogekai.github.io/lynq/)

## License

MIT
