# agentPayment()

> **Protocol:** This implementation conforms to the
> [Agent Payment Protocol](https://github.com/hogekai/agent-payment-protocol)
> specification.

Agent-to-agent payment middleware via form elicitation. Unlike [`payment()`](/payment/overview) which redirects humans to a browser, `agentPayment()` collects a structured `PaymentProof` directly from the calling agent.

## Import

```ts
import { agentPayment } from "@lynq/lynq/agent-payment";
```

## Usage

```ts
server.tool("premium", agentPayment({
  recipient: "0x1234...",
  amount: "1.00",
  verify: async (proof, request) => {
    // verify signature or tx_hash
    return true;
  },
}), config, handler);
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | `"agent-payment"` | Middleware name |
| `recipient` | `string` | **(required)** | Recipient wallet address |
| `amount` | `string` | **(required)** | Amount in token units (string for decimal precision) |
| `token` | `string` | `"USDC"` | Token symbol |
| `network` | `string` | `"base"` | Network identifier (e.g. `"base"`, `"ethereum"`, `"solana"`) |
| `sessionKey` | `string` | `"agent-payment"` | Session key for storing payment proof |
| `message` | `string` | Auto-generated | Message shown in elicitation form |
| `once` | `boolean` | `true` | If true, skip after first successful verification in session |
| `verify` | `(proof, request) => Promise<boolean>` | **(required)** | Verify payment proof |
| `receipt` | `boolean` | `true` | Append `_agent_payment` receipt to tool result |
| `skipIf` | `(c) => boolean \| Promise<boolean>` | — | Custom skip condition (priority over session check) |
| `onComplete` | `(c) => void \| Promise<void>` | — | Called after verification succeeds, before `next()` |

## PaymentProof

The agent submits a proof via form elicitation:

```ts
interface PaymentProof {
  /** "signature" = facilitator-verified, "tx_hash" = on-chain */
  type: "signature" | "tx_hash";
  /** The signature or transaction hash */
  value: string;
}
```

## Verify Helpers

Two built-in helpers cover common verification patterns:

### verifyOnChain

Verify a `tx_hash` by checking the on-chain transaction receipt via JSON-RPC.

```ts
import { agentPayment, verifyOnChain } from "@lynq/lynq/agent-payment";

server.tool("premium", agentPayment({
  recipient: "0x1234...",
  amount: "1.00",
  network: "base",
  verify: verifyOnChain({ rpcUrl: "https://mainnet.base.org" }),
}), config, handler);
```

### verifyViaFacilitator

Verify a `signature` by forwarding to a facilitator endpoint.

```ts
import { agentPayment, verifyViaFacilitator } from "@lynq/lynq/agent-payment";

server.tool("premium", agentPayment({
  recipient: "0x1234...",
  amount: "1.00",
  verify: verifyViaFacilitator({ url: "https://facilitator.example.com/verify" }),
}), config, handler);
```

## Example

```ts
import { createMCPServer, text } from "@lynq/lynq";
import { agentPayment, verifyOnChain } from "@lynq/lynq/agent-payment";
import { z } from "zod";

const mcp = createMCPServer({ name: "paid-api", version: "1.0.0" });

mcp.tool(
  "premium_data",
  agentPayment({
    recipient: "0x1234...",
    amount: "0.01",
    token: "USDC",
    network: "base",
    verify: verifyOnChain(),
  }),
  {
    description: "Get premium data (requires payment)",
    input: z.object({ query: z.string() }),
  },
  async (args, c) => c.text(`Premium result for: ${args.query}`),
);

// Per-call billing
mcp.tool(
  "generate_image",
  agentPayment({
    recipient: "0x1234...",
    amount: "0.10",
    token: "USDC",
    network: "base",
    once: false, // charge every call
    verify: verifyOnChain(),
  }),
  {
    description: "Generate an image (charged per use)",
    input: z.object({ prompt: z.string() }),
  },
  async (args, c) => c.text(`Generated image for: ${args.prompt}`),
);
```

## Comparison with payment()

| | `payment()` | `agentPayment()` |
|---|---|---|
| **Target** | Human users | LLM agents |
| **Mechanism** | URL elicitation (browser redirect) | Form elicitation (structured data) |
| **Completion** | HTTP callback → `completeElicitation()` | Agent submits proof via form |
| **Tool visibility** | Hidden until paid (`onRegister: false`) | Always visible |
| **`once` default** | N/A (controlled by provider) | `true` |
| **Callback route** | Required | Not needed |

## Wallet Detection

`agentPayment()` embeds a `[x-agent-payment:{...}]` tag in the elicitation message containing the payment details as structured JSON. Wallet implementations detect this tag — not the human-readable text.

```
Payment required: 0.01 USDC to 0x1234... on base.
[x-agent-payment:{"recipient":"0x1234...","amount":"0.01","token":"USDC","network":"base"}]
```

Use the exported `parsePaymentMeta()` helper to extract payment details from a message:

```ts
import { parsePaymentMeta } from "@lynq/lynq/agent-payment";

const meta = parsePaymentMeta(message);
if (meta) {
  // meta: { recipient, amount, token, network }
}
```

## Payment Receipt

By default, `agentPayment()` appends a `_agent_payment` JSON block to the tool result after the handler completes. This lets the calling agent (e.g. Claude) see what was paid without the service author writing any `onResult` logic.

```json
{
  "_agent_payment": {
    "amount": "0.01",
    "token": "USDC",
    "recipient": "0x1234...",
    "tx": "0xabc...",
    "network": "base",
    "paidAt": "2026-03-17T12:00:00.000Z"
  }
}
```

Disable with `receipt: false` if you don't want the receipt appended.

::: tip Under the hood
On tool call, the `onCall` hook checks the session for an existing proof. If absent, it calls `c.elicit.form()` with a raw JSON Schema for `{ type, value }` and a message containing the `[x-agent-payment]` tag. The calling agent (or wallet hook) fills the form with a `PaymentProof`. The middleware then runs the user-provided `verify()` function. If valid, the proof is stored in the session and `next()` is called.

After the handler returns, the `onResult` hook appends the payment receipt to the result (unless `receipt: false`). When `once: false`, it also clears the session key, requiring payment on every invocation.
:::
