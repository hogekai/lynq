# Claude Code

Configure Claude Code to connect to your lynq MCP server.

## Stdio (Local)

Add a `.mcp.json` file to your project root:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["tsx", "server.ts"]
    }
  }
}
```

Claude Code spawns your server as a child process and communicates over stdin/stdout.

## HTTP (Remote)

If your server runs over HTTP (e.g. with [Hono](/getting-started/with-hono) or [Express](/getting-started/with-express)):

```json
{
  "mcpServers": {
    "my-server": {
      "type": "url",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## Project-Scoped vs Global

- **Project-scoped:** Place `.mcp.json` at your project root. The server is available only when Claude Code is working in that project.
- **Global:** Place the config at `~/.claude/.mcp.json`. The server is available in all projects.

## Multiple Servers

```json
{
  "mcpServers": {
    "weather": {
      "command": "npx",
      "args": ["tsx", "servers/weather.ts"]
    },
    "database": {
      "type": "url",
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

:::tip Under the hood
Claude Code reads `.mcp.json` at startup. For stdio servers, it spawns a child process and establishes a JSON-RPC session over stdin/stdout. For URL servers, it connects via HTTP using the Streamable HTTP transport defined in the MCP spec. In both cases, the MCP session lifecycle (initialization, capability negotiation, tool list fetching) is managed entirely by the client.
:::

## Next Steps

- [Quick Start](/getting-started/quick-start) -- build your first server
- [Transports](/concepts/transports) -- understand stdio vs HTTP
