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
      return false; // hidden until ctx.session.authorize("admin")
    },
    onCall(ctx, next) {
      if (!ctx.session.get("isAdmin")) {
        return ctx.error("Admin only.");
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
  async onCall(ctx, next) {
    const start = performance.now();
    const result = await next();
    const ms = (performance.now() - start).toFixed(0);
    console.log(`[${ctx.toolName}] ${ms}ms`);
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
    onCall(ctx) {
      return ctx.error("Service is under maintenance.");
    },
  };
}

server.use(maintenanceMode());
```

:::tip Under the hood
The middleware chain is assembled once at `server.tool()` registration time. Global middlewares (from `server.use()`) are prepended to per-tool middlewares. The `onCall` chain follows the Koa pattern: each middleware calls `next()` to proceed, and can inspect or modify the result after `next()` resolves. `onResult` hooks run in reverse order after the handler completes, allowing outer middleware to see the final transformed result.
:::

## What's Next

- [Middleware Recipes](/guides/middleware-recipes) -- copy-paste middleware for common patterns
- [Middleware](/concepts/middleware) -- interface definition and execution order
