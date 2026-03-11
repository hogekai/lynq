# Tasks

> **@experimental** -- `server.task()` depends on the MCP SDK's experimental Tasks API. The lynq interface is stable; the internal SDK wiring may change.

Tasks are long-running operations with progress reporting and cancellation. They share the same registration pattern as tools -- same middleware, same visibility system -- but the handler receives a `TaskContext` with additional controls.

## Basic Usage

```ts
import { createMCPServer } from "@lynq/lynq";
import { z } from "zod";

const server = createMCPServer({ name: "my-server", version: "1.0.0" });

server.task(
  "analyze_data",
  {
    description: "Run a slow data analysis",
    input: z.object({ query: z.string() }),
  },
  async (args, c) => {
    c.task.progress(0, "Starting analysis...");
    await new Promise((r) => setTimeout(r, 2000));

    c.task.progress(50, "Halfway...");
    await new Promise((r) => setTimeout(r, 2000));

    c.task.progress(100, "Complete");
    return c.text(`Analysis result for: ${args.query}`);
  },
);
```

## TaskContext

`TaskContext` extends `ToolContext` with a `task` property:

| Property | Type | Description |
|----------|------|-------------|
| `task.progress` | `(percentage: number, message?: string) => void` | Report progress (0-100) with optional status message |
| `task.cancelled` | `boolean` | `true` when the client has cancelled this task |

Everything else from `ToolContext` is available: `session`, `elicit`, `sample`, `roots`, `text()`, `error()`, etc.

## Progress Reporting

Call `c.task.progress()` at meaningful checkpoints. The percentage (0-100) and optional message are sent to the client:

```ts
c.task.progress(0, "Downloading data...");
// ... work ...
c.task.progress(33, "Parsing...");
// ... work ...
c.task.progress(66, "Analyzing...");
// ... work ...
c.task.progress(100, "Done");
```

## Cancellation

Check `c.task.cancelled` periodically to respect client cancellation:

```ts
server.task("long_job", config, async (args, c) => {
  for (let i = 0; i < 100; i++) {
    if (c.task.cancelled) {
      return c.text("Cancelled by client");
    }
    await doChunk(i);
    c.task.progress(i + 1);
  }
  return c.text("Complete");
});
```

## Middleware

Tasks use the same middleware system as tools. Global middleware (`server.use()`) applies to tasks. Per-task middleware works inline:

```ts
import { guard } from "@lynq/lynq/guard";

server.use(logger);  // applies to all tools AND tasks

server.task("admin_export", guard(), config, async (args, c) => {
  // hidden until authorized, just like tools
  c.task.progress(0, "Exporting...");
  // ...
  return c.text("Export complete");
});
```

:::tip Under the hood
Tasks use the MCP SDK's experimental task primitives. When you call `c.task.progress()`, lynq sends a `tasks/progress` notification to the client. The `cancelled` flag is updated when the client sends a `tasks/cancel` request. Internally, tasks go through the same middleware chain as tools -- `onCall`, `onResult`, and visibility via `onRegister` all work identically.
:::

## Tasks vs Tools

| | Tools | Tasks |
|---|---|---|
| Duration | Short (synchronous feel) | Long-running |
| Progress | No | Yes (`c.task.progress()`) |
| Cancellation | Via `c.signal` (AbortSignal) | Via `c.task.cancelled` |
| Middleware | Same | Same |
| Visibility | Same | Same |

Use tools for quick operations. Use tasks when the operation takes noticeable time and the user benefits from progress updates.
