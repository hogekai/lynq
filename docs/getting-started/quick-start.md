# Quick Start

lynq is a framework for building [MCP](/getting-started/mcp-overview) servers with middleware and session-scoped tool visibility.

## Install

```sh
npm install @lynq/lynq zod
```

## Minimal Server

```ts
// server.ts
import { createMCPServer } from "@lynq/lynq";
import { z } from "zod";

const server = createMCPServer({ name: "my-server", version: "1.0.0" });

server.tool(
  "greet",
  {
    description: "Say hello",
    input: z.object({ name: z.string() }),
  },
  async (args, ctx) => ctx.text(`Hello, ${args.name}!`),
);

await server.stdio();
```

Run it:

```sh
npx tsx server.ts
```

That's it. One tool, stdio transport, zero config.

## Connect to Claude Code

Add to your Claude Code config (`claude_code_config.json`):

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

Restart Claude Code. The `greet` tool appears in the tool list.

:::tip Under the hood
`server.stdio()` creates an `StdioServerTransport` from the MCP SDK and connects it to the internal server. The client spawns your process, then communicates over stdin/stdout using JSON-RPC. All MCP protocol negotiation (capabilities, initialization) is handled by the SDK.
:::

## Add Auth-Protected Tools

lynq's core feature is session-scoped tool visibility. Tools guarded by middleware are hidden until the session is authorized. Here's an example using the built-in `guard()` middleware:

```ts
import { createMCPServer } from "@lynq/lynq";
import { guard } from "@lynq/lynq/guard";
import { z } from "zod";

const server = createMCPServer({ name: "my-server", version: "1.0.0" });

// Always visible -- the entry point
server.tool(
  "login",
  {
    description: "Login with credentials",
    input: z.object({
      username: z.string(),
      password: z.string(),
    }),
  },
  async (args, ctx) => {
    if (args.username === "admin" && args.password === "1234") {
      ctx.session.set("user", { name: args.username });
      ctx.session.authorize("guard");
      return ctx.text(`Welcome, ${args.username}.`);
    }
    return ctx.error("Invalid credentials.");
  },
);

// Hidden until ctx.session.authorize("guard") is called
server.tool(
  "get_weather",
  guard(),
  {
    description: "Get current weather for a city",
    input: z.object({ city: z.string() }),
  },
  async (args, ctx) => ctx.text(`${args.city}: 22C, Sunny`),
);

await server.stdio();
```

> `guard()` is a middleware that demonstrates the visibility pattern. For production use cases, write your own middleware tailored to your auth system -- see [Custom Middleware](/guides/custom-middleware).

## Verify Visibility

Before login, the client sees:

| Tool | Visible |
|------|---------|
| `login` | Yes |
| `get_weather` | No |

After calling `login` with valid credentials:

| Tool | Visible |
|------|---------|
| `login` | Yes |
| `get_weather` | Yes |

The client receives the notification automatically. No manual `sendToolListChanged` call needed.

## Next Steps

- [Middleware](/concepts/middleware) -- understand the middleware model
- [Session & Visibility](/concepts/session-and-visibility) -- lynq's core concept
- [With Hono](/getting-started/with-hono) -- deploy over HTTP
