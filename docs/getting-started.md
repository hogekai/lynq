# Getting Started

## Install

```sh
npm install @lynq/lynq @modelcontextprotocol/sdk zod
```

## Minimal Server

```ts
// server.ts
import { createMCPServer, text } from "@lynq/lynq";
import { z } from "zod";

const server = createMCPServer({ name: "my-server", version: "1.0.0" });

server.tool(
  "greet",
  {
    description: "Say hello",
    input: z.object({ name: z.string() }),
  },
  async (args) => text(`Hello, ${args.name}!`),
);

await server.stdio();
```

Run it:

```sh
npx tsx server.ts
```

That's it. One tool, stdio transport, zero config.

## Connect to Claude Desktop

Add to your project's `.mcp.json`:

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

Restart Claude Desktop. The `greet` tool appears in the tool list.

## Add Auth-Protected Tools

lynq's core feature is session-scoped tool visibility. Tools guarded by `auth()` are hidden until the session is authorized.

```ts
// server.ts
import { createMCPServer, text, error } from "@lynq/lynq";
import { auth } from "@lynq/lynq/auth";
import { z } from "zod";

const server = createMCPServer({ name: "my-server", version: "1.0.0" });

// Always visible — the entry point
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
      ctx.session.authorize("auth");
      return text(`Welcome, ${args.username}.`);
    }
    return error("Invalid credentials.");
  },
);

// Hidden until ctx.session.authorize("auth") is called
server.tool(
  "get_weather",
  auth(),
  {
    description: "Get current weather for a city",
    input: z.object({ city: z.string() }),
  },
  async (args) => text(`${args.city}: 22C, Sunny`),
);

await server.stdio();
```

:::tip What's happening
`auth()` returns a middleware named `"auth"` with `onRegister() { return false }` -- this hides the tool at registration time. When `ctx.session.authorize("auth")` runs, lynq sends a `tools/list_changed` notification to the client. The client re-fetches the tool list and sees `get_weather` appear.
:::

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

- [Why lynq?](./why-lynq.md) -- design decisions and comparison
- [API Overview](./api/overview.md) -- full API surface at a glance
