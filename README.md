# lynq

Lightweight MCP server framework. Tool visibility control through middleware.

```ts
import { createMCPServer } from "lynq";
import { auth } from "lynq/auth";
import { z } from "zod";

const server = createMCPServer({ name: "my-server", version: "1.0.0" });

// Login tool — always visible
server.tool("login", {
  input: z.object({ username: z.string(), password: z.string() }),
}, async (args, ctx) => {
  const user = await authenticate(args.username, args.password);
  ctx.session.set("user", user);
  ctx.session.authorize("auth");
  return { content: [{ type: "text", text: `Welcome, ${user.name}` }] };
});

// Weather tool — hidden until authenticated
server.tool("weather", auth(), {
  description: "Get weather for a city",
  input: z.object({ city: z.string() }),
}, async (args) => {
  const data = await fetchWeather(args.city);
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
});

await server.stdio();
```

## Install

```sh
npm install lynq @modelcontextprotocol/sdk zod
```

## Why lynq

When you build an MCP server, you often need to show different tools depending on session state — hide admin tools from unauthenticated users, reveal features after onboarding, etc. The MCP protocol supports this via bidirectional tool list notifications, but wiring it by hand means managing visibility sets, diffing tool lists, and calling `sendToolListChanged` at the right time. lynq lets you declare visibility as middleware and handles the rest.

## API

### `createMCPServer(info)`

Creates a server instance.

```ts
const server = createMCPServer({ name: "my-server", version: "1.0.0" });
```

### `server.tool(name, ...middlewares?, config, handler)`

Register a tool. Middlewares are optional, config holds `description` and `input` schema.

```ts
server.tool("greet", {
  description: "Greet someone",
  input: z.object({ name: z.string() }),
}, async (args) => ({
  content: [{ type: "text", text: `Hello ${args.name}` }],
}));

server.tool("secret", auth(), {
  input: z.object({ query: z.string() }),
}, async (args) => ({
  content: [{ type: "text", text: args.query }],
}));
```

### `server.use(middleware)`

Apply middleware to all subsequently registered tools.

```ts
server.use(auth());
```

### Session

Available in handlers and middleware via `ctx.session`:

```ts
ctx.session.set("key", value);
ctx.session.get("key");
ctx.session.authorize("auth"); // Enable tools guarded by "auth" middleware
```

### `auth(options?)`

Middleware that hides tools until authenticated.

```ts
import { auth } from "lynq/auth";

auth();                          // checks ctx.session.get("user")
auth({ sessionKey: "token" });   // checks ctx.session.get("token")
auth({ message: "Login first" }); // custom error message
```

## License

MIT
