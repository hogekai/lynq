# Tasks

Tasks are long-running operations with progress reporting and cancellation. Same registration pattern as tools — same middleware, same visibility system.

> **@experimental** — `server.task()` depends on the MCP SDK's experimental Tasks API. lynq's interface is stable; internal SDK wiring may change.

## Tasks vs Tools

| | Tools | Tasks |
|---|---|---|
| Duration | Short (synchronous feel) | Long-running |
| Progress | No | Yes (`c.task.progress()`) |
| Cancellation | `c.signal` (AbortSignal) | `c.task.cancelled` (boolean) |
| Middleware | Same | Same |
| Visibility | Same | Same |

Use tools for quick operations. Use tasks when the operation takes significant time and the user benefits from progress updates.

## Registering a Task

```ts
import { z } from "zod";

server.task(
  "analyze_data",
  {
    description: "Run data analysis",
    input: z.object({ query: z.string() }),
  },
  async (args, c) => {
    c.task.progress(0, "Starting analysis...");

    const data = await fetchData(args.query);
    c.task.progress(30, "Data loaded");

    const result = await processData(data);
    c.task.progress(80, "Processing complete");

    const summary = formatResult(result);
    c.task.progress(100, "Done");

    return c.text(summary);
  },
);
```

## Progress Reporting

`c.task.progress(percentage, message?)` sends a progress update to the client in real time.

```ts
for (let i = 0; i < items.length; i++) {
  await processItem(items[i]);
  c.task.progress(
    Math.round(((i + 1) / items.length) * 100),
    `Processed ${i + 1}/${items.length}`,
  );
}
```

- `percentage`: 0–100
- `message`: optional human-readable status text

## Cancellation

Check `c.task.cancelled` periodically to respect client cancellation requests:

```ts
server.task(
  "long_export",
  { description: "Export all records" },
  async (_args, c) => {
    const batches = await getBatches();

    for (let i = 0; i < batches.length; i++) {
      if (c.task.cancelled) {
        return c.text(`Cancelled after ${i} batches.`);
      }

      await exportBatch(batches[i]);
      c.task.progress(Math.round(((i + 1) / batches.length) * 100));
    }

    return c.text("Export complete.");
  },
);
```

## Middleware with Tasks

`server.use()` applies to both tools **and** tasks. Per-task middleware works inline, just like tools.

```ts
import { guard } from "@lynq/lynq/guard";
import { logger } from "@lynq/lynq/logger";

// Global — applies to all tools and tasks
server.use(logger());

// Per-task middleware
server.task(
  "admin_export",
  guard(),
  {
    description: "Export admin data (requires auth)",
    input: z.object({ format: z.enum(["csv", "json"]) }),
  },
  async (args, c) => {
    c.task.progress(0, "Starting export...");
    // ...
    return c.text("Done");
  },
);
```

## TaskContext

`TaskContext` extends `ToolContext` — everything available in tools is also available in tasks:

| Property | Description |
|---|---|
| `c.task.progress()` | Report progress (tasks only) |
| `c.task.cancelled` | Check cancellation (tasks only) |
| `c.elicit` | Request user input |
| `c.sample` | Request LLM inference |
| `c.session` | Session state and visibility |
| `c.store` / `c.userStore` | Persistent storage |

:::tip Under the hood
When you register a task, lynq creates an internal task entry identical to a tool entry but backed by the SDK's experimental Tasks API. Progress calls map to SDK task status updates. The `cancelled` flag is set when the client sends a cancellation request. Because `TaskContext` extends `ToolContext`, all middleware hooks (`onCall`, `onResult`, `onRegister`) work identically.
:::

## Limitations

> **No graceful shutdown.** Running tasks are fire-and-forget — if the server process exits, in-flight tasks are silently dropped. There is no `drain()` or `waitForTasks()` API. This is a known limitation of the `@experimental` Tasks API. If your task performs critical work, ensure idempotency so it can be safely re-run.

## What's Next

- [Middleware](/concepts/middleware) — how middleware applies to tasks
- [Session & Visibility](/concepts/session-and-visibility) — visibility control for tasks
- [Sampling](/concepts/sampling) — LLM inference available in task handlers
