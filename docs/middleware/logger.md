# logger()

Logs tool calls with execution time.

## Import

```ts
import { logger } from "@lynq/lynq/logger";
```

## Usage

```ts
server.use(logger());
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `log` | `(message: string) => void` | `console.log` | Custom log function |

## Example

```ts
import { createMCPServer, text } from "@lynq/lynq";
import { logger } from "@lynq/lynq/logger";

const server = createMCPServer({ name: "my-app", version: "1.0.0" });

// Apply globally to all tools
server.use(logger());

// Or use a custom log function
server.use(logger({ log: (msg) => fs.appendFileSync("mcp.log", msg + "\n") }));

server.tool(
  "greet",
  { description: "Say hello" },
  async (c) => text(`Hello, ${c.params.name}!`),
);
```

Output:

```
[greet] called (session: abc123)
[greet] 4.2ms
```

On error:

```
[greet] called (session: abc123)
[greet] 12.5ms ERROR
```

:::tip Under the hood
Uses the `onCall` hook. Records `performance.now()` before calling `next()`, then logs the tool name, elapsed time, and whether the result has `isError` set. Since it wraps `next()`, it measures the full execution time including any downstream middleware and the handler itself.
:::
