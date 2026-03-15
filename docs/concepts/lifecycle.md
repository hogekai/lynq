# Lifecycle Hooks

Server-level hooks for reacting to startup and session events.

## Setup

Pass hooks as options to `createMCPServer`:

```ts
import { createMCPServer } from "@lynq/lynq";

const server = createMCPServer({
  name: "my-server",
  version: "1.0.0",
  onServerStart: () => {
    console.log("Server started");
  },
  onSessionCreate: (sessionId) => {
    console.log(`Session created: ${sessionId}`);
  },
  onSessionDestroy: (sessionId, data) => {
    console.log(`Session destroyed: ${sessionId}`);
    // data contains session KV pairs — e.g. data.get("user") for cleanup
  },
});
```

## Hooks

| Hook | Signature | When |
|------|-----------|------|
| `onServerStart` | `() => void \| Promise<void>` | After stdio connect, or on first HTTP request |
| `onSessionCreate` | `(sessionId: string) => void \| Promise<void>` | When a new session is first accessed |
| `onSessionDestroy` | `(sessionId: string, data: ReadonlyMap<string, unknown>) => void \| Promise<void>` | When an HTTP session closes |

All hooks are optional. All hooks are **fire-and-forget** -- errors (sync throws or async rejections) are silently caught and do not affect server operation.

## onServerStart

Fires once after the server is ready to handle requests.

- **stdio**: after `server.connect(transport)` completes
- **HTTP**: on the first incoming request (since there is no explicit `listen()` call)

```ts
createMCPServer({
  name: "my-server",
  version: "1.0.0",
  onServerStart: async () => {
    await db.connect();
    console.log("Database connected, server ready");
  },
});
```

## onSessionCreate

Fires once per unique session ID, when the session is first accessed (lazily created).

```ts
createMCPServer({
  name: "my-server",
  version: "1.0.0",
  onSessionCreate: async (sessionId) => {
    await analytics.track("session_start", { sessionId });
  },
});
```

For stdio transport, the default `"default"` session is created on the first tool call.

## onSessionDestroy

Fires when a session is destroyed (HTTP session close or transport disconnect). The second argument contains the session's KV data, useful for cleanup (e.g. resolving the user ID to delete store entries).

```ts
createMCPServer({
  name: "my-server",
  version: "1.0.0",
  onSessionDestroy: async (sessionId, data) => {
    const user = data.get("user");
    if (user) {
      await store.delete(`user:${user}:preferences`);
    }
  },
});
```

## What's Next

- [Session & Visibility](/concepts/session-and-visibility) -- connection-scoped state
- [Store & Persistence](/concepts/store) -- persistent state across sessions
- [Transports](/concepts/transports) -- stdio vs HTTP
