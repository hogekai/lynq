# Store & Persistence

lynq sessions are connection-scoped -- when the connection drops, all state is lost. The Store abstraction provides persistent key-value storage that survives reconnections.

## Session vs Store

| | `c.session` | `c.store` / `c.userStore` |
|---|---|---|
| Lifetime | Connection-scoped | Persistent (Store implementation) |
| API | Synchronous | Async (`Promise`) |
| Storage | In-memory Map | Configurable (Redis, SQLite, KV, etc.) |
| Use case | Temp tokens, rate limits | User profiles, payment history |

## Setup

```ts
import { createMCPServer, memoryStore } from "@lynq/lynq";

const server = createMCPServer({
  name: "my-server",
  version: "1.0.0",
  store: memoryStore(), // default if omitted
});
```

`memoryStore()` is in-process and lost on restart. For production, provide a custom `Store` implementation backed by Redis, SQLite, or any KV store.

## c.store (Global)

Global key-value store available in tool, resource, and task handlers:

```ts
server.tool("config", {}, async (_args, c) => {
  await c.store.set("feature_flags", { newUI: true });
  const flags = await c.store.get<{ newUI: boolean }>("feature_flags");
  await c.store.delete("feature_flags");
  return c.json(flags);
});
```

### TTL

Optional TTL in seconds:

```ts
await c.store.set("cache:weather", data, 300); // expires in 5 minutes
```

If the Store implementation doesn't support TTL, it may ignore it.

## c.userStore (User-scoped)

Same API as `c.store`, but keys are automatically prefixed with the user ID:

```ts
// Internally: store.get("user:alice:preferences")
const prefs = await c.userStore.get("preferences");
await c.userStore.set("preferences", { theme: "dark" });
```

### User ID Resolution

The user ID is resolved from `c.session.get("user")`:

| Session value | Resolved ID |
|---|---|
| `"alice"` | `"alice"` |
| `{ id: "u-1" }` | `"u-1"` |
| `{ id: 42 }` | `"42"` |
| `{ sub: "auth0\|123" }` | `"auth0\|123"` |

If no user is in the session, `userStore` methods throw an error. Set the user before using `userStore`:

```ts
c.session.set("user", "alice");
await c.userStore.set("prefs", { theme: "dark" }); // works
```

## server.store

The store instance is also available on the server object. Use this in external HTTP callback routes:

```ts
app.get("/payment/callback", async (c) => {
  const { sid, eid } = c.req.query();
  // Persist payment in store
  const userId = mcp.session(sid).get<string>("user");
  await mcp.store.set(`user:${userId}:payment`, { paid: true });
  // Also set in session for current connection
  mcp.session(sid).set("payment", { paid: true });
  mcp.completeElicitation(eid);
  return c.html("<p>Done!</p>");
});
```

## Custom Store

Implement the `Store` interface for your backend:

```ts
import type { Store } from "@lynq/lynq";

function redisStore(client: RedisClient): Store {
  return {
    async get(key) {
      const val = await client.get(key);
      return val ? JSON.parse(val) : undefined;
    },
    async set(key, value, ttl) {
      const json = JSON.stringify(value);
      if (ttl) await client.setex(key, ttl, json);
      else await client.set(key, json);
    },
    async delete(key) {
      await client.del(key);
    },
  };
}

const server = createMCPServer({
  name: "my-server",
  version: "1.0.0",
  store: redisStore(redis),
});
```

## Persistent Middleware

`oauth()`, `payment()`, and `urlAction()` support a `persistent` option that uses `c.userStore` instead of `c.session` for state:

```ts
import { payment } from "@lynq/lynq/payment";

server.tool("premium", payment({
  buildUrl: ({ sessionId, elicitationId }) => `https://...`,
  persistent: true, // survives reconnection
}), config, handler);
```

When `persistent: true`:
- **Check**: reads from `c.userStore` (async) instead of `c.session` (sync)
- **Callback**: your HTTP handler must write to `server.store` (the middleware only reads)
- **Visibility**: `c.session.authorize()` is still called for current-session tool visibility

See [payment()](/payment/overview) and [Auth Providers](/auth/overview) for details.

## Without Store

Store is a convenience layer, not a requirement. For complex queries, transactions, or relational data, use `skipIf` and `onComplete` to call your own database directly:

```ts
import { payment } from "@lynq/lynq/payment";

server.tool("premium", payment({
  message: "This costs $0.01",
  buildUrl: ({ sessionId, elicitationId }) =>
    `https://my-app.com/pay?state=${sessionId}:${elicitationId}`,

  // Check your DB instead of Store
  skipIf: async (c) => {
    const user = c.session.get<{ id: string }>("user");
    if (!user) return false;
    return await db.hasPaid(user.id, c.toolName);
  },

  // Record to your DB instead of Store
  onComplete: async (c) => {
    const user = c.session.get<{ id: string }>("user");
    if (user) {
      await db.recordPayment(user.id, c.toolName, {
        amount: 0.01,
        paidAt: new Date(),
      });
    }
  },
}), config, handler);
```

This pattern works with any middleware that builds on `urlAction()`: `payment()`, `oauth()`, `stripe()`, `crypto()`, `github()`, `google()`.

`skipIf` takes priority over the default `sessionKey` check. `onComplete` runs after the elicitation succeeds, before `next()`.

## What's Next

- [Session & Visibility](/concepts/session-and-visibility) -- connection-scoped state
- [payment()](/payment/overview) -- persistent payment flows
- [Auth Flow](/guides/auth-flow) -- authentication patterns
