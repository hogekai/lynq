# Middleware Recipes

Copy-paste middleware for common patterns.

:::tip Built-in alternatives
`logger()`, `rateLimit()`, and `truncate()` are now available as built-in middleware from `@lynq/lynq/logger`, `@lynq/lynq/rate-limit`, and `@lynq/lynq/truncate` respectively. The recipes below show how they work internally -- for production use, prefer the built-in versions.
:::

## truncate

Limit response text length.

```ts
import type { ToolMiddleware } from "@lynq/lynq";

function truncate(maxLength: number): ToolMiddleware {
  return {
    name: "truncate",
    onResult(result) {
      return {
        ...result,
        content: result.content.map((c) =>
          c.type === "text" && c.text.length > maxLength
            ? { ...c, text: c.text.slice(0, maxLength) + `... [truncated]` }
            : c,
        ),
      };
    },
  };
}

server.tool("search", truncate(1000), config, handler);
```

## rateLimit

Session-scoped call limit per tool.

```ts
import type { ToolMiddleware } from "@lynq/lynq";

function rateLimit(max: number): ToolMiddleware {
  return {
    name: "rateLimit",
    onCall(c, next) {
      const key = `rateLimit:${c.toolName}`;
      const count = c.session.get<number>(key) ?? 0;
      if (count >= max) {
        return c.error(`Rate limit exceeded (${max} calls).`);
      }
      c.session.set(key, count + 1);
      return next();
    },
  };
}

server.tool("expensive", rateLimit(10), config, handler);
```

## logging

Log tool execution time and result status.

```ts
import type { ToolMiddleware } from "@lynq/lynq";

const logging: ToolMiddleware = {
  name: "logging",
  async onCall(c, next) {
    const start = performance.now();
    const result = await next();
    const ms = (performance.now() - start).toFixed(0);
    const status = result.isError ? "ERROR" : "OK";
    console.log(`[${c.toolName}] ${status} ${ms}ms`);
    return result;
  },
};

server.use(logging);
```

## cache

Time-based result cache per tool per session.

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

## requireSession

Guard tools that need specific session state before execution.

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

## Combinators

lynq provides three combinators from `@lynq/lynq/combine` to compose middleware logic.

### `some()` -- first match wins

Run middlewares in order. The first one that calls `next()` wins. If all short-circuit, the last error is returned.

```ts
import { some } from "@lynq/lynq/combine";
import { guard } from "@lynq/lynq/guard";
import { credentials } from "@lynq/lynq/credentials";

// Allow access if EITHER already logged in OR submitting credentials
server.tool("dashboard", some(guard(), credentials({
  message: "Login required",
  schema: z.object({ token: z.string() }),
  verify: async (fields) => validateToken(fields.token),
})), config, handler);
```

### `every()` -- all must pass

Run all middlewares in sequence. If any short-circuits, the chain stops.

```ts
import { every } from "@lynq/lynq/combine";
import { guard } from "@lynq/lynq/guard";
import { rateLimit } from "@lynq/lynq/rate-limit";

// Must be authenticated AND within rate limit
server.tool("api", every(guard(), rateLimit({ max: 100 })), config, handler);
```

### `except()` -- conditional bypass

Skip a middleware when a condition is true.

```ts
import { except } from "@lynq/lynq/combine";
import { rateLimit } from "@lynq/lynq/rate-limit";

// Rate limit everyone except admins
server.tool("search", except(
  (c) => c.session.get("role") === "admin",
  rateLimit({ max: 10 }),
), config, handler);
```

:::tip Under the hood
These recipes are pure functions returning plain objects. No class inheritance, no framework coupling. The `cache` recipe uses a closure-scoped `Map` -- this works because in stateful mode each session's middleware chain shares the same middleware instances. In sessionless mode, middleware instances are recreated per request, so cache would not persist across calls.
:::
