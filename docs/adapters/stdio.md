# Stdio Transport

The stdio transport connects your MCP server over standard input/output. This is the default transport for local tools, CLI integrations, and Claude Desktop.

## Usage

```ts
import { createMCPServer, text } from "@lynq/lynq";
import { z } from "zod";

const server = createMCPServer({
  name: "my-server",
  version: "1.0.0",
});

server.tool(
  "greet",
  {
    description: "Greet someone by name",
    input: z.object({ name: z.string() }),
  },
  (args) => text(`Hello, ${args.name}!`),
);

server.stdio();
```

## Claude Desktop Configuration

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["tsx", "/path/to/server.ts"]
    }
  }
}
```

## When to Use

Use stdio for local development, Claude Desktop integration, and CLI tools where the client spawns your server as a child process.
