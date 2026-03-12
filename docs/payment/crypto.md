# Crypto Payment

On-chain crypto payment middleware. Tools are hidden until payment is verified.

## Import

```ts
import { crypto, handleCallback } from "@lynq/crypto";
```

## Usage

```ts
server.tool("premium", crypto({
  recipient: "0x...",
  amount: 0.01,
  baseUrl: "http://localhost:3000",
}), config, handler);
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | `"crypto"` | Middleware name |
| `token` | `string` | `"USDC"` | Token symbol (e.g. `"USDC"`, `"USDT"`, `"DAI"`, `"ETH"`) |
| `recipient` | `string` | **(required)** | Recipient wallet address |
| `amount` | `number` | **(required)** | Amount in token units (e.g. 0.01) |
| `network` | `string` | `"base"` | Chain: `"base"`, `"base-sepolia"`, `"ethereum"`, `"polygon"`, `"solana"` |
| `baseUrl` | `string` | **(required)** | Base URL of your server |
| `callbackPath` | `string` | `"/payment/crypto/callback"` | Callback path |
| `sessionKey` | `string` | `"payment"` | Session key for payment data |
| `once` | `boolean` | `false` | If true, charge only once per session |
| `message` | `string` | `"Payment required (X TOKEN)."` | Elicitation message |
| `timeout` | `number` | `300000` | Timeout in ms |
| `persistent` | `boolean` | `false` | Use `userStore` for state that survives reconnection |

## Example

```ts
import { createMCPServer } from "@lynq/lynq";
import { crypto, handleCallback } from "@lynq/crypto";
import { Hono } from "hono";
import { z } from "zod";

const RECIPIENT = "0x1234...";

const mcp = createMCPServer({ name: "paid-api", version: "1.0.0" });

mcp.tool(
  "premium",
  crypto({
    recipient: RECIPIENT,
    amount: 0.01,
    token: "USDC",
    network: "base-sepolia",
    baseUrl: "http://localhost:3000",
  }),
  { description: "Premium tool", input: z.object({}) },
  async (_args, c) => c.text("Premium content"),
);

const app = new Hono();
const handler = mcp.http();
app.all("/mcp", (c) => handler(c.req.raw));

// Payment page — render your own UI (wallet connect, QR code, etc.)
app.get("/payment/crypto/callback", (c) => {
  const { recipient, amount, token, network, state } = c.req.query();
  return c.html(`
    <h1>Send ${amount} ${token}</h1>
    <p>To: ${recipient}</p>
    <p>Network: ${network}</p>
    <form method="POST" action="/payment/crypto/callback">
      <input type="hidden" name="state" value="${state}" />
      <input type="text" name="txHash" placeholder="Paste transaction hash" />
      <button type="submit">I've sent the payment</button>
    </form>
  `);
});

// Payment verification callback
app.post("/payment/crypto/callback", async (c) => {
  const body = await c.req.parseBody();
  const result = await handleCallback(
    mcp,
    { state: body.state as string, txHash: body.txHash as string },
    { recipient: RECIPIENT, amount: 0.01 },
  );
  if (!result.success) return c.text(`Error: ${result.error}`, 400);
  return c.html("<p>Payment verified! You can close this tab.</p>");
});

export default { port: 3000, fetch: app.fetch };
```

## No External Dependencies

Transaction verification uses raw `fetch` + JSON-RPC (`eth_getTransactionReceipt`). No `viem` or `ethers` required. For more rigorous on-chain verification (amount, recipient, token contract), implement your own callback handler instead of `handleCallback`.

::: tip Under the hood
`crypto()` wraps `payment()` which wraps `urlAction()`. When a protected
tool is called, it builds a URL with payment parameters (recipient, amount, token, network)
and state (`sessionId:elicitationId`) as query params, then opens it via URL elicitation.
Your server renders a payment page where the user can send the specified token. After submission,
`handleCallback()` verifies the transaction receipt via JSON-RPC and calls
`server.completeElicitation()` to unblock the middleware.
:::
