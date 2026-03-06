# lynq

[![CI](https://github.com/hogekai/lynq/actions/workflows/ci.yml/badge.svg)](https://github.com/hogekai/lynq/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@lynq/lynq)](https://www.npmjs.com/package/@lynq/lynq)

Lightweight MCP server framework. Tool visibility control through middleware.

```ts
import { createMCPServer } from "@lynq/lynq";
import { auth } from "@lynq/lynq/auth";
import { z } from "zod";

const server = createMCPServer({ name: "my-server", version: "1.0.0" });

server.tool("login", {
  input: z.object({ username: z.string(), password: z.string() }),
}, async (args, ctx) => {
  const user = await authenticate(args.username, args.password);
  ctx.session.set("user", user);
  ctx.session.authorize("auth");
  return ctx.text(`Welcome, ${user.name}`);
});

server.tool("weather", auth(), {
  description: "Get weather for a city",
  input: z.object({ city: z.string() }),
}, async (args, ctx) => {
  return ctx.text(JSON.stringify(await fetchWeather(args.city)));
});

await server.stdio();
```

## Install

```sh
npm install @lynq/lynq @modelcontextprotocol/sdk zod
```

## Documentation

[https://hogekai.github.io/lynq/](https://hogekai.github.io/lynq/)

## License

MIT
