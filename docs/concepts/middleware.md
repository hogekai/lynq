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

> **Contract:** Always `return await next()`. Combinators like `some()` detect passage by checking whether `next()` was called; the return value of `next()` must be propagated back for correct results. Calling `next()` without returning its result is undefined behavior.

## Global vs Per-Registration

```ts
// Global -- applies to all tools, resources, and tasks registered after this call
server.use(logger);

// Per-tool -- applies only to this tool, runs after global middleware
server.tool("search", truncate(500), { description: "Search" }, handler);
```

Global middleware is prepended to per-registration middleware. Adding `server.use()` after `server.tool()` / `server.resource()` / `server.task()` has no effect on already-registered items.

## Context (`c`)

The `ToolContext` object `c` is available in both `onCall` and `onResult`. Key properties for middleware:

| Property | Type | Description |
|----------|------|-------------|
| `c.toolName` | `string` | Name of the tool being called |
| `c.args` | `Record<string, unknown>` | Arguments passed to the tool |
| `c.session` | `Session` | Session-scoped state |
| `c.store` | `Store` | Global persistent store |
| `c.signal` | `AbortSignal` | Client abort signal |
| `c.sessionId` | `string` | Session identifier |

`c.args` is useful for middleware like [`cache()`](/middleware/cache) that needs to generate keys based on tool arguments.

## Minimal Example

```ts
import type { ToolMiddleware } from "@lynq/lynq";

const logger: ToolMiddleware = {
  name: "logger",
  onCall(c, next) {
    console.log(`[${c.toolName}] called with`, c.args);
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
- [Elicitation](/concepts/elicitation) -- interactive user input in tool handlers
- [Tasks](/concepts/tasks) -- long-running operations using the same middleware
- [Middleware Overview](/middleware/overview) -- all 17 built-in middleware at a glance
- [Custom Middleware](/middleware/custom) -- write your own middleware
