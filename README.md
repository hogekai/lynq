# lynq

Lightweight MCP server framework. Tool visibility control through middleware.

```ts
import { createMCPServer } from "lynq";
import { auth } from "lynq/auth";
import { z } from "zod";

const server = createMCPServer({ name: "my-server", version: "1.0.0" });

// Login tool — always visible
server.tool("login", { username: z.string(), password: z.string() }, async (args, ctx) => {
  const user = await authenticate(args.username, args.password);
  ctx.session.set("user", user);
  ctx.session.authorize("auth");
  return { content: [{ type: "text", text: `Welcome, ${user.name}` }] };
});

// Weather tool — hidden until authenticated
server.tool("weather", auth(), { city: z.string() }, async (args) => {
  const data = await fetchWeather(args.city);
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
});

await server.stdio();
```

## Install

```sh
npm install lynq @modelcontextprotocol/sdk zod
```

## What lynq does

- **Hono-style middleware** — global via `server.use()`, per-tool inline
- **Session-scoped tool visibility** — `ctx.session.authorize()` / `ctx.session.revoke()` show/hide tools per session
- **Thin layer** — delegates to the official MCP SDK for protocol handling

## What lynq does NOT do

- HTTP server or auth implementation
- Database or session persistence
- Tool discovery or directory scanning
- Anything the official SDK already handles

## API

### `createMCPServer(info)`

Creates a server instance.

```ts
const server = createMCPServer({ name: "my-server", version: "1.0.0" });
```

### `server.tool(name, ...middlewares?, schema, handler)`

Register a tool. Middlewares are optional.

```ts
server.tool("greet", { name: z.string() }, async (args) => ({
  content: [{ type: "text", text: `Hello ${args.name}` }],
}));

server.tool("secret", auth(), { query: z.string() }, async (args) => ({
  content: [{ type: "text", text: args.query }],
}));
```

### `server.use(middleware)`

Apply middleware to all subsequently registered tools.

```ts
server.use(auth());
```

### `server.stdio()`

Start the server with stdio transport.

### Session API

Available in tool handlers and middleware via `ctx.session`:

```ts
ctx.session.set("key", value);
ctx.session.get("key");
ctx.session.authorize("auth");      // Enable tools guarded by "auth" middleware
ctx.session.revoke("auth");         // Disable them again
ctx.session.enableTools("weather"); // Enable specific tools
ctx.session.disableTools("weather");
```

### `auth(options?)`

Middleware that hides tools until authenticated.

```ts
import { auth } from "lynq/auth";

auth();                          // checks ctx.session.get("user")
auth({ sessionKey: "token" });   // checks ctx.session.get("token")
auth({ message: "Login first" }); // custom error message
```

### Custom Middleware

```ts
import type { ToolMiddleware } from "lynq";

const rateLimit = (max: number): ToolMiddleware => ({
  name: "rateLimit",
  async onCall(ctx, next) {
    const count = ctx.session.get<number>("callCount") ?? 0;
    if (count >= max) {
      return { content: [{ type: "text", text: "Rate limited" }], isError: true };
    }
    ctx.session.set("callCount", count + 1);
    return next();
  },
});
```

## License

MIT
