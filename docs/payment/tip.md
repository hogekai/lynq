# tip()

Post-result tip middleware. Appends a tip link to successful tool responses without blocking execution.

## Import

```ts
import { tip } from "@lynq/lynq/tip";
```

## Usage

```ts
server.tool("search", tip({
  url: (sessionId) => `http://localhost:3000/tip?session=${sessionId}`,
}), config, handler);
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | `"tip"` | Middleware name |
| `url` | `(sessionId: string) => string` | **(required)** | Tip page URL builder |
| `message` | `string` | `"If this was helpful, consider leaving a tip!"` | Text prepended to the tip link |

## Behavior

- Uses `onResult` only — no `onRegister`, no `onCall`
- Does **not** hide tools or block execution
- Appends a text content block with the tip message and URL to successful results
- Skips error results (`result.isError === true`)
- Non-blocking: the tip link is informational text, not an elicitation

## Example

```ts
import { createMCPServer } from "@lynq/lynq";
import { tip } from "@lynq/lynq/tip";
import { truncate } from "@lynq/lynq/truncate";
import { z } from "zod";

const mcp = createMCPServer({ name: "demo", version: "1.0.0" });

mcp.tool(
  "search",
  truncate(4000),
  tip({
    message: "Was this helpful? Leave a tip!",
    url: (sessionId) => `http://localhost:3000/tip?session=${sessionId}`,
  }),
  { description: "Search", input: z.object({ q: z.string() }) },
  async (args, c) => c.text(`Results for: ${args.q}`),
);
```

The tool response will include the original result followed by the tip text:

```
Results for: hello

Was this helpful? Leave a tip!
http://localhost:3000/tip?session=abc123
```
