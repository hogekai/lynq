# Middleware Recipes

Copy-paste middleware for common patterns.

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
    onCall(ctx, next) {
      const key = `rateLimit:${ctx.toolName}`;
      const count = ctx.session.get<number>(key) ?? 0;
      if (count >= max) {
        return ctx.error(`Rate limit exceeded (${max} calls).`);
      }
      ctx.session.set(key, count + 1);
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
  async onCall(ctx, next) {
    const start = performance.now();
    const result = await next();
    const ms = (performance.now() - start).toFixed(0);
    const status = result.isError ? "ERROR" : "OK";
    console.log(`[${ctx.toolName}] ${status} ${ms}ms`);
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
    async onCall(ctx, next) {
      const key = ctx.toolName + ":" + ctx.sessionId;
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
    onCall(ctx, next) {
      if (!ctx.session.get(key)) {
        return ctx.error(message ?? `Missing required session key: ${key}`);
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
