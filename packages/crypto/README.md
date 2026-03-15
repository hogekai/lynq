# @lynq/crypto

Crypto payment provider for [lynq](https://www.npmjs.com/package/@lynq/lynq) MCP framework. Supports USDC, USDT, DAI, ETH on Base, Ethereum, Polygon, and Solana.

## Install

```sh
npm install @lynq/crypto @lynq/lynq
```

## Usage

```ts
import { createMCPServer } from "@lynq/lynq";
import { crypto } from "@lynq/crypto";

const server = createMCPServer({ name: "my-server", version: "1.0.0" });

server.tool("premium-feature", crypto({
  recipient: "0x...",
  amount: 5, // 5 USDC
  baseUrl: "http://localhost:3000",
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
  pages: { crypto: true },
});
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `recipient` | `string` | required | Wallet address |
| `amount` | `number` | required | Amount in token units |
| `baseUrl` | `string` | required | Base URL for callback |
| `token` | `string` | `"USDC"` | Token: USDC, USDT, DAI, ETH, or custom |
| `network` | `string` | `"base"` | Network: base, base-sepolia, ethereum, polygon, solana, or custom |
| `callbackPath` | `string` | `"/payment/crypto/callback"` | Callback route path |
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
