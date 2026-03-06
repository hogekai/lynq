# Custom Middleware

Middleware is a plain object implementing the `ToolMiddleware` interface. No classes, no inheritance.

## ToolMiddleware interface

```ts
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

interface ToolMiddleware {
  /** Unique name for this middleware instance. Used for authorize()/revoke(). */
  name: string;
  /** Called when a tool is registered. Return false to hide the tool initially. */
  onRegister?(tool: ToolInfo): boolean | undefined;
  /** Called when a tool is invoked. Must call next() to continue the chain. */
  onCall?(
    ctx: ToolContext,
    next: () => Promise<CallToolResult>,
  ): Promise<CallToolResult>;
  /** Called after the handler returns. Runs in reverse middleware order. */
  onResult?(
    result: CallToolResult,
    ctx: ToolContext,
  ): CallToolResult | Promise<CallToolResult>;
}
```

## Execution order

```
Request
  → global[0].onCall
    → global[1].onCall
      → perTool[0].onCall
        → perTool[1].onCall
          → handler
        → perTool[1].onResult   ← reverse order
      → perTool[0].onResult
    → global[1].onResult
  → global[0].onResult
Response
```

If any `onCall` short-circuits (does not call `next()`), the handler and all `onResult` hooks are skipped.

## Minimal example: logger

```ts
import type { ToolMiddleware } from "@lynq/lynq";

const logger: ToolMiddleware = {
  name: "logger",
  onCall(ctx, next) {
    console.log(`[${ctx.toolName}] called`);
    return next();
  },
};

server.use(logger);
```

## onRegister: initial visibility

```ts
function adminOnly(): ToolMiddleware {
  return {
    name: "admin",
    onRegister() {
      return false; // hidden until ctx.session.authorize("admin")
    },
    onCall(ctx, next) {
      if (!ctx.session.get("isAdmin")) {
        return { content: [{ type: "text", text: "Admin only." }], isError: true };
      }
      return next();
    },
  };
}

server.tool("reset-db", adminOnly(), { description: "Reset database" }, handler);
```

## onResult: truncate response

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

## onCall: pre/post next() timing

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

## Global vs per-tool

```ts
// Global — applies to all tools registered after this call
server.use(logger);

// Per-tool — applies only to this tool, runs after global middleware
server.tool("search", truncate(500), { description: "Search" }, handler);
```
