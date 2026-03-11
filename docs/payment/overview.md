# payment()

URL-based payment flow middleware. Tools are hidden until payment is completed.

## Import

```ts
import { payment } from "@lynq/lynq/payment";
```

## Usage

```ts
server.tool("premium", payment({
  buildUrl: ({ sessionId, elicitationId }) =>
    `https://pay.example.com/checkout?sid=${sessionId}&eid=${elicitationId}`,
}), config, handler);
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | `"payment"` | Middleware name |
| `sessionKey` | `string` | `"payment"` | Session key for payment status |
| `message` | `string` | `"Please complete payment to continue."` | Elicitation message |
| `buildUrl` | `(params: { sessionId: string; elicitationId: string }) => string` | — | **Required.** URL builder for payment page |
| `timeout` | `number` | `300000` | Timeout in ms |

## Example

```ts
import { createMCPServer } from "@lynq/lynq";
import { payment } from "@lynq/lynq/payment";
import { Hono } from "hono";
import { z } from "zod";

const mcp = createMCPServer({ name: "paid-api", version: "1.0.0" });

mcp.tool(
  "generate_report",
  payment({
    buildUrl: ({ sessionId, elicitationId }) =>
      `http://localhost:3000/pay?sid=${sessionId}&eid=${elicitationId}`,
  }),
  { description: "Generate premium report", input: z.object({ topic: z.string() }) },
  async (args, c) => c.text(`Report for: ${args.topic}`),
);

const app = new Hono();
const handler = mcp.http();
app.all("/mcp", (c) => handler(c.req.raw));

// Payment callback — called by your payment provider
app.get("/pay/complete", async (c) => {
  const eid = c.req.query("eid")!;
  await mcp.completeElicitation(eid);
  return c.html("<p>Payment received! You can close this tab.</p>");
});

export default { port: 3000, fetch: app.fetch };
```

## Providers

| Provider | Status | Description |
|----------|--------|-------------|
| `payment()` | Available | Generic URL-based payment |
| USDC (x402) | Coming soon | Autonomous agent payments |

:::tip Under the hood
`payment()` wraps `urlAction()`. On tool call, it opens the payment URL via URL elicitation with `waitForCompletion: true`. The promise resolves when `server.completeElicitation(elicitationId)` is called from your payment callback, or when the timeout expires. The `sessionKey` defaults to `"payment"` (not `"user"`) to keep payment state separate from auth state.
:::
