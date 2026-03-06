# MCP Overview

[Model Context Protocol (MCP)](https://modelcontextprotocol.io/) is an open protocol that lets AI agents interact with external servers. This page explains MCP's core concepts through lynq code examples.

## How MCP Works

```
AI Agent (Claude, Cursor, etc.)  ←──JSON-RPC──→  MCP Server (your code)
                                                        ↕
                                                   External API (optional)
```

The agent connects to your server. Your server exposes **tools**, **resources**, and **tasks**. The agent calls tools, reads resources, and runs tasks as needed to accomplish the user's goal.

Your MCP server can optionally call external APIs behind the scenes. The agent doesn't see the API directly -- it only sees the tools and resources you expose.

## Tools

A tool is a function the agent can call. You define the name, input schema, and handler:

```ts
import { createMCPServer } from "@lynq/lynq";
import { z } from "zod";

const server = createMCPServer({ name: "my-server", version: "1.0.0" });

server.tool(
  "get_weather",
  {
    description: "Get weather for a city",
    input: z.object({ city: z.string() }),
  },
  async (args, ctx) => ctx.text(`${args.city}: 22°C, Sunny`),
);
```

When the user asks "What's the weather in Tokyo?", the agent:
1. Sees `get_weather` in the tool list
2. Calls `get_weather({ city: "Tokyo" })`
3. Gets back `"Tokyo: 22°C, Sunny"`
4. Uses the result to answer the user

## Resources

A resource is data the agent can read, identified by a URI:

```ts
server.resource(
  "config://settings",
  { name: "App Settings", mimeType: "application/json" },
  async () => ({ text: '{"theme":"dark","lang":"en"}' }),
);
```

The agent can list available resources and read them by URI. Unlike tools, resources are read-only -- they don't take input arguments.

## Tasks

A task is a long-running operation with progress reporting. Like tools, but the agent can track progress and cancel mid-execution:

```ts
server.task(
  "analyze_data",
  {
    description: "Run data analysis",
    input: z.object({ query: z.string() }),
  },
  async (args, ctx) => {
    ctx.task.progress(0, "Starting...");
    const data = await fetchData(args.query);
    ctx.task.progress(50, "Processing...");
    const result = analyzeData(data);
    ctx.task.progress(100, "Done");
    return ctx.text(JSON.stringify(result));
  },
);
```

> Tasks are experimental in the MCP SDK. lynq's `server.task()` interface is stable, but the underlying SDK wiring may change.

## External APIs

An MCP server often wraps external APIs. The agent calls your tool; your tool calls the API:

```ts
server.tool(
  "search_github",
  {
    description: "Search GitHub repositories",
    input: z.object({ query: z.string() }),
  },
  async (args, ctx) => {
    const res = await fetch(
      `https://api.github.com/search/repositories?q=${args.query}`
    );
    const data = await res.json();
    return ctx.json(data.items.map((r: any) => r.full_name));
  },
);
```

The agent sees `search_github` as a tool. It doesn't know or care that GitHub's API is behind it. This is the typical MCP pattern: your server is a bridge between the agent and any external service.

## Transports

MCP uses two transport modes to connect agents and servers:

**Stdio** -- The agent spawns your server as a child process. Communication happens over stdin/stdout. Used by Claude Desktop and Claude Code for local servers.

```ts
await server.stdio();
```

**HTTP** -- The server runs as a web service. The agent connects over HTTP. Used for remote/shared servers.

```ts
const handler = server.http();
// Mount on Hono, Express, Deno, etc.
```

See [Transports](/concepts/transports) for details.

## What lynq Adds

The official MCP SDK gives you the protocol layer. lynq adds:

**Middleware** -- Attach logic to tool registration and invocation. Like Hono's middleware, but for MCP tools.

```ts
server.use(logger);                           // global
server.tool("search", rateLimit(10), config, handler); // per-tool
```

**Session-scoped visibility** -- Tools can appear and disappear per session. The MCP protocol supports this via `notifications/tools/list_changed`, but wiring it by hand is tedious. lynq handles it automatically.

```ts
// Hidden until ctx.session.authorize("auth")
server.tool("admin_panel", auth(), config, handler);
```

**Elicitation** -- Ask the user for input during tool execution:

```ts
const result = await ctx.elicit.form("Set preferences", z.object({
  theme: z.enum(["light", "dark"]),
}));
```

**Sampling** -- Request LLM inference from the client:

```ts
const answer = await ctx.sample("Summarize this text", { maxTokens: 100 });
```

:::tip Under the hood
MCP is a bidirectional protocol. The server can push notifications to the client at any time -- for example, `notifications/tools/list_changed` tells the client to re-fetch the tool list. lynq uses this to make tools appear and disappear based on session state. You declare the rules as middleware; lynq sends the notifications.
:::

## Next Steps

- [Quick Start](/getting-started/quick-start) -- build and run your first server
