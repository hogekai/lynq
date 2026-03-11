# truncate()

Truncates text content in tool responses.

## Import

```ts
import { truncate } from "@lynq/lynq/truncate";
```

## Usage

```ts
server.tool("search", truncate({ maxChars: 1000 }), config, handler);
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxChars` | `number` | (required) | Maximum characters per text block |
| `suffix` | `string` | `"..."` | Appended to truncated text |

## Example

```ts
import { createMCPServer, text } from "@lynq/lynq";
import { truncate } from "@lynq/lynq/truncate";

const server = createMCPServer({ name: "my-app", version: "1.0.0" });

server.tool(
  "search",
  truncate({ maxChars: 500 }),
  { description: "Search documents" },
  async (c) => {
    const doc = await documents.find(c.params.query);
    return text(doc.fullText); // may be thousands of chars
  },
);
```

If `doc.fullText` is 2000 characters, the response is trimmed to 497 characters plus `"..."` (500 total). A custom suffix can be specified:

```ts
truncate({ maxChars: 500, suffix: " [truncated]" })
```

:::tip Under the hood
Uses the `onResult` hook, which runs after the handler returns. Iterates over `result.content` and truncates only blocks with `type: "text"`. Other content types (images, embedded resources, etc.) pass through unchanged. The suffix length is subtracted from `maxChars` so the total output never exceeds the limit.
:::
