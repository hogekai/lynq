# Custom Middleware

Practical examples for writing your own middleware. For the interface definition and execution model, see [Middleware](/concepts/middleware).

## onRegister: Initial Visibility

Hide tools until a condition is met:

```ts
import type { ToolMiddleware } from "@lynq/lynq";

function adminOnly(): ToolMiddleware {
  return {
    name: "admin",
    onRegister() {
      return false; // hidden until c.session.authorize("admin")
    },
    onCall(c, next) {
      if (!c.session.get("isAdmin")) {
        return c.error("Admin only.");
      }
      return next();
    },
  };
}

server.tool("reset-db", adminOnly(), { description: "Reset database" }, handler);
```

## onResult: Transform Responses

Modify the handler's return value:

```ts
function truncate(maxLength: number): ToolMiddleware {
  return {
    name: "truncate",
    onResult(result) {
      return {
        ...result,
        content: result.content.map((c) =>
          c.type === "text" && c.text.length > maxLength
            ? { ...c, text: c.text.slice(0, maxLength) + "..." }
            : c,
        ),
      };
    },
  };
}

server.tool("search", truncate(500), { description: "Search" }, handler);
```

## onCall: Pre/Post Processing

Code before `next()` runs on the way in; code after runs on the way out.

```ts
const timer: ToolMiddleware = {
  name: "timer",
  async onCall(c, next) {
    const start = performance.now();
    const result = await next();
    const ms = (performance.now() - start).toFixed(0);
    console.log(`[${c.toolName}] ${ms}ms`);
    return result;
  },
};
```

## Short-Circuiting

If `onCall` doesn't call `next()`, the handler and all `onResult` hooks are skipped:

```ts
function maintenanceMode(): ToolMiddleware {
  return {
    name: "maintenance",
    onCall(c) {
      return c.error("Service is under maintenance.");
    },
  };
}

server.use(maintenanceMode());
```

:::tip Under the hood
The middleware chain is assembled once at `server.tool()` registration time. Global middlewares (from `server.use()`) are prepended to per-tool middlewares. The `onCall` chain follows the Koa pattern: each middleware calls `next()` to proceed, and can inspect or modify the result after `next()` resolves. `onResult` hooks run in reverse order after the handler completes, allowing outer middleware to see the final transformed result.
:::

## Recipes

Copy-paste middleware for common patterns.

### cache -- time-based result cache

```ts
import type { ToolMiddleware } from "@lynq/lynq";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

function cache(ttlMs: number = 60_000): ToolMiddleware {
  const store = new Map<string, { result: CallToolResult; expires: number }>();
  return {
    name: "cache",
    async onCall(c, next) {
      const key = c.toolName + ":" + c.sessionId;
      const cached = store.get(key);
      if (cached && Date.now() < cached.expires) {
        return cached.result;
      }
      const result = await next();
      store.set(key, { result, expires: Date.now() + ttlMs });
      return result;
    },
  };
}

server.tool("weather", cache(30_000), config, handler);
```

### requireSession -- guard specific session keys

```ts
import type { ToolMiddleware } from "@lynq/lynq";

function requireSession(key: string, message?: string): ToolMiddleware {
  return {
    name: "requireSession",
    onCall(c, next) {
      if (!c.session.get(key)) {
        return c.error(message ?? `Missing required session key: ${key}`);
      }
      return next();
    },
  };
}

server.tool("deploy", requireSession("env", "Set environment first."), config, handler);
```

:::tip Under the hood
These recipes are pure functions returning plain objects. No class inheritance, no framework coupling. The `cache` recipe uses a closure-scoped `Map` -- this works because in stateful mode each session's middleware chain shares the same middleware instances. In sessionless mode, middleware instances are recreated per request, so cache would not persist across calls.
:::

## What's Next

- [Middleware Overview](/middleware/overview)
- [Middleware Concepts](/concepts/middleware)
