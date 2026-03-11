# rateLimit()

Session-scoped rate limiting per tool.

## Import

```ts
import { rateLimit } from "@lynq/lynq/rate-limit";
```

## Usage

```ts
server.tool("search", rateLimit({ max: 10 }), config, handler);
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `max` | `number` | (required) | Maximum calls per window |
| `windowMs` | `number` | `60000` | Window duration in milliseconds |
| `message` | `string` | `"Rate limit exceeded. Max {max} calls per {windowMs/1000}s."` | Custom error message |

## Example

```ts
import { createMCPServer, text } from "@lynq/lynq";
import { rateLimit } from "@lynq/lynq/rate-limit";

const server = createMCPServer({ name: "my-app", version: "1.0.0" });

server.tool(
  "search",
  rateLimit({ max: 5, windowMs: 30_000 }),
  { description: "Search the database" },
  async (c) => {
    const results = await db.search(c.params.query);
    return text(JSON.stringify(results));
  },
);
```

The first 5 calls within any 30-second window succeed. The 6th call returns an error. The counter resets when the window expires.

:::tip Under the hood
Uses the `onCall` hook. Stores a `{ count, resetAt }` object in the session via `c.session.get/set` with the key `rateLimit:{toolName}`. When the current time exceeds `resetAt`, the counter resets to 1 and a new window begins. Each session has its own independent counter -- one user hitting the limit does not affect others.
:::
