# Middleware

Middleware is a plain object implementing the `ToolMiddleware` interface. No classes, no inheritance.

## The Three Hooks

```ts
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

interface ToolMiddleware {
  /** Unique name for this middleware instance. Used for authorize()/revoke(). */
  name: string;
  /** Called when a tool is registered. Return false to hide the tool initially. */
  onRegister?(tool: ToolInfo): boolean | undefined;
  /** Called when a tool is invoked. Must call next() to continue the chain. */
  onCall?(
    c: ToolContext,
    next: () => Promise<CallToolResult>,
  ): Promise<CallToolResult>;
  /** Called after the handler returns. Runs in reverse middleware order. */
  onResult?(
    result: CallToolResult,
    c: ToolContext,
  ): CallToolResult | Promise<CallToolResult>;
}
```

| Hook | When | Use case |
|------|------|----------|
| `onRegister` | Tool registration | Hide tools initially (return `false`) |
| `onCall` | Tool invocation | Auth checks, logging, rate limiting |
| `onResult` | After handler returns | Transform or truncate responses |

## Execution Order

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

## Global vs Per-Tool

```ts
// Global -- applies to all tools registered after this call
server.use(logger);

// Per-tool -- applies only to this tool, runs after global middleware
server.tool("search", truncate(500), { description: "Search" }, handler);
```

Global middleware is prepended to per-tool middleware. Adding `server.use()` after `server.tool()` has no effect on already-registered tools.

## Minimal Example

```ts
import type { ToolMiddleware } from "@lynq/lynq";

const logger: ToolMiddleware = {
  name: "logger",
  onCall(c, next) {
    console.log(`[${c.toolName}] called`);
    return next();
  },
};

server.use(logger);
```

:::tip Under the hood
When `onRegister` returns `false`, lynq stores the tool internally but excludes it from `tools/list` responses to the client. The middleware chain is built at registration time and frozen -- the order of `onCall` / `onResult` execution is determined by the order of `server.use()` and inline middleware arguments.
:::

## What's Next

- [Session & Visibility](/concepts/session-and-visibility) -- how middleware controls what the client sees
- [Middleware Overview](/middleware/overview) -- all 14 built-in middleware at a glance
- [Custom Middleware](/middleware/custom) -- write your own middleware
