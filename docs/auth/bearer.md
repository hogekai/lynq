# bearer()

Bearer token verification middleware for HTTP-based MCP servers.

## Import

```ts
import { bearer } from "@lynq/lynq/bearer";
```

## Usage

```ts
server.tool("data", bearer({
  verify: async (token) => {
    const user = await db.findUserByToken(token);
    return user ?? null;
  },
}), config, handler);
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | `"bearer"` | Middleware name |
| `tokenKey` | `string` | `"token"` | Session key where the raw token is read from |
| `sessionKey` | `string` | `"user"` | Session key to store the verified user |
| `verify` | `(token: string) => Promise<unknown \| null>` | **(required)** | Return user data or `null` to reject |
| `message` | `string` | `"Invalid or missing token."` | Error message shown when verification fails |

## Example

A complete example showing `bearer()` on a tool together with the `onRequest` hook
that bridges HTTP `Authorization` headers into the MCP session.

```ts
import { createMCPServer } from "@lynq/lynq";
import { bearer } from "@lynq/lynq/bearer";
import { z } from "zod";

const server = createMCPServer({ name: "api", version: "1.0.0" });

server.tool(
  "data",
  bearer({
    verify: async (token) => {
      const user = await db.findUserByToken(token);
      return user ?? null;
    },
  }),
  { description: "Fetch data", input: z.object({ query: z.string() }) },
  async (args, c) => {
    const user = c.session.get("user");
    return c.text(`Hello ${user.name}`);
  },
);

const handler = server.http({
  onRequest(req, sessionId, session) {
    const auth = req.headers.get("Authorization");
    if (auth?.startsWith("Bearer ")) {
      session.set("token", auth.slice(7));
    }
  },
});
```

**Flow:** `onRequest` extracts the token from the HTTP header and writes it to
the session. `bearer()` reads it back via `tokenKey`, calls `verify()`, and
stores the result under `sessionKey`. The tool handler can then access the
verified user with `c.session.get("user")`.

::: tip Under the hood
`bearer()` uses `onRegister() => false` to hide protected tools from the tool
list initially. When a tool is called, the middleware reads `session.get(tokenKey)`.
If a token is present it calls `verify()`. When `verify()` returns a non-null
value, the middleware stores it in `sessionKey`, calls `authorize(name)` to make
the tool visible, and proceeds to the handler. If the token is missing or
`verify()` returns `null`, the middleware short-circuits with an error response.
:::
