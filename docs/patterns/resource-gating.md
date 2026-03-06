# Resource Gating

Resources use the same middleware and visibility system as tools. Hidden resources are excluded from `resources/list` and reject `resources/read`.

## auth() on a Resource

```ts
import { createMCPServer } from "@lynq/lynq";
import { auth } from "@lynq/lynq/auth";

const server = createMCPServer({ name: "docs", version: "1.0.0" });

// Public resource — always visible
server.resource(
  "config://public",
  { name: "Public Config" },
  async () => ({ text: '{"theme":"light"}' }),
);

// Protected resource — hidden until auth() is authorized
server.resource(
  "config://secrets",
  auth(),
  { name: "Secret Config" },
  async () => ({ text: '{"apiKey":"sk-..."}' }),
);
```

## authorize() Reveals Both Tools and Resources

A single `ctx.session.authorize("auth")` call reveals every tool **and** every resource guarded by the `"auth"` middleware. Both `tools/list_changed` and `resources/list_changed` notifications fire automatically.

```ts
server.tool(
  "login",
  { description: "Log in" },
  async (args, ctx) => {
    ctx.session.set("user", args.user);
    ctx.session.authorize("auth");
    // Both "admin-panel" tool and "config://secrets" resource appear
    return { content: [{ type: "text", text: "Logged in" }] };
  },
);

server.tool(
  "admin-panel",
  auth(),
  { description: "Admin operations" },
  async () => ({
    content: [{ type: "text", text: "Admin panel data" }],
  }),
);
```

## Individual Resource Control

Use `enableResources()` / `disableResources()` for fine-grained control independent of middleware authorization.

```ts
import type { ToolMiddleware } from "@lynq/lynq";

function hidden(name: string): ToolMiddleware {
  return { name, onRegister: () => false };
}

server.resource(
  "report://daily",
  hidden("report-gate"),
  { name: "Daily Report", mimeType: "text/plain" },
  async () => ({ text: "Today's report..." }),
);

server.resource(
  "report://weekly",
  hidden("report-gate"),
  { name: "Weekly Report", mimeType: "text/plain" },
  async () => ({ text: "This week's report..." }),
);

server.tool(
  "unlock_daily",
  { description: "Unlock only the daily report" },
  async (_args, ctx) => {
    ctx.session.enableResources("report://daily");
    return { content: [{ type: "text", text: "Daily report unlocked" }] };
  },
);
```

## Important: server.use() Does NOT Apply to Resources

Global middleware registered with `server.use()` applies to tools and tasks only. Resource middleware is always per-resource.

```ts
server.use(auth()); // applies to all tools and tasks

// This resource is NOT affected by the global auth() above.
// To gate it, pass auth() directly:
server.resource(
  "config://settings",
  auth(), // per-resource middleware
  { name: "Settings" },
  async () => ({ text: "{}" }),
);
```
