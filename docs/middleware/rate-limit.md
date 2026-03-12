# rateLimit()

Rate limiting per tool. Session-scoped by default, with optional Store-based distributed mode.

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
| `store` | `boolean` | `false` | Use persistent Store for distributed rate limiting |
| `perUser` | `boolean` | `false` | Scope rate limiting per user (implies `store: true`) |

## Example

```ts
import { createMCPServer, text } from "@lynq/lynq";
import { rateLimit } from "@lynq/lynq/rate-limit";

const server = createMCPServer({ name: "my-app", version: "1.0.0" });

server.tool(
  "search",
  rateLimit({ max: 5, windowMs: 30_000 }),
  { description: "Search the database" },
  async (args) => {
    const results = await db.search(args.query);
    return text(JSON.stringify(results));
  },
);
```

The first 5 calls within any 30-second window succeed. The 6th call returns an error. The counter resets when the window expires.

## Store-Based (Distributed)

By default, rate limits are session-scoped -- each connection has its own counter. For distributed environments where limits should persist across sessions, enable `store`:

```ts
rateLimit({ max: 100, windowMs: 60_000, store: true })
```

With `store: true`:
- State is stored in `c.store` (async, persistent) instead of `c.session` (sync, connection-scoped)
- Rate limits are shared across all sessions
- State survives reconnections

## Per-User Rate Limiting

Scope limits per user with `perUser`. This automatically enables `store: true`:

```ts
rateLimit({ max: 10, perUser: true })
```

The rate limit key is prefixed with the user ID resolved from `session.get("user")`. Each user has an independent counter. If no user is in the session, falls back to `"anon"`.

:::tip Under the hood
Uses the `onCall` hook. In session mode, stores `{ count, resetAt }` via `c.session.get/set` with key `rateLimit:{toolName}`. In store mode, uses `c.store.get/set` with key `rateLimit:{toolName}` or `rateLimit:{userId}:{toolName}` (perUser). Store entries are set with a TTL matching `windowMs` for automatic cleanup.
:::
