# Stripe Checkout

Stripe Checkout payment middleware. Tools are hidden until payment is completed via Stripe.

## Install

::: code-group

```sh [pnpm]
pnpm add @lynq/stripe stripe
```

```sh [npm]
npm install @lynq/stripe stripe
```

```sh [yarn]
yarn add @lynq/stripe stripe
```

```sh [bun]
bun add @lynq/stripe stripe
```

:::

## Import

```ts
import { stripe, handleCallback } from "@lynq/stripe";
```

## Usage

```ts
server.tool("premium_search", stripe({
  secretKey: STRIPE_SECRET_KEY,
  baseUrl: "http://localhost:3000",
  amount: 100, // $1.00
}), config, handler);
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | `"stripe"` | Middleware name |
| `secretKey` | `string` | **(required)** | Stripe secret key |
| `baseUrl` | `string` | **(required)** | Base URL of your server |
| `callbackPath` | `string` | `"/payment/stripe/callback"` | Callback path |
| `amount` | `number` | **(required)** | Price in cents (e.g. 100 = $1.00) |
| `currency` | `string` | `"usd"` | ISO 4217 currency code |
| `description` | `string` | `"Tool access"` | Product name on Stripe Checkout |
| `sessionKey` | `string` | `"payment"` | Session key for payment data |
| `once` | `boolean` | `false` | If true, charge only once per session |
| `message` | `string` | `"Payment required ($X.XX)."` | Elicitation message |
| `timeout` | `number` | `300000` | Timeout in ms |
| `persistent` | `boolean` | `false` | Use `userStore` for state that survives reconnection |

## Example

```ts
import { createMCPServer } from "@lynq/lynq";
import { stripe, handleCallback } from "@lynq/stripe";
import { Hono } from "hono";
import { z } from "zod";

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY!;

const mcp = createMCPServer({ name: "paid-api", version: "1.0.0" });

mcp.tool(
  "premium_search",
  stripe({
    secretKey: STRIPE_KEY,
    baseUrl: "http://localhost:3000",
    amount: 100,
    description: "Premium search access",
    once: true,
  }),
  { description: "Premium search", input: z.object({ query: z.string() }) },
  async (args, c) => c.text(`Results for: ${args.query}`),
);

const app = new Hono();
const handler = mcp.http();
app.all("/mcp", (c) => handler(c.req.raw));

app.get("/payment/stripe/callback", async (c) => {
  if (c.req.query("cancelled")) {
    return c.html("<p>Payment cancelled.</p>");
  }
  const result = await handleCallback(
    mcp,
    {
      checkoutSessionId: c.req.query("session_id")!,
      state: c.req.query("state")!,
    },
    { secretKey: STRIPE_KEY },
  );
  if (!result.success) return c.text(`Error: ${result.error}`, 400);
  return c.html("<p>Payment complete! You can close this tab.</p>");
});

export default { port: 3000, fetch: app.fetch };
```

::: tip Under the hood
`stripe()` wraps `payment()` which wraps `urlAction()`. When a protected
tool is called, it creates a Stripe Checkout Session via the Stripe API (lazy-imported)
and opens the checkout URL via URL elicitation. The `state` parameter in the success URL
encodes `sessionId:elicitationId`. When the user completes payment, Stripe redirects to
your callback URL. `handleCallback()` retrieves the Checkout Session, verifies
`payment_status === "paid"`, stores payment data in the session, and calls
`server.completeElicitation()` to unblock the waiting middleware.
:::
