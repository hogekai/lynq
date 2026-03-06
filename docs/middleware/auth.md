# Auth Middleware

Built-in middleware for session-scoped tool visibility. Tools start hidden and appear after authentication.

## Usage

```ts
import { createMCPServer, text } from "@lynq/lynq";
import { auth } from "@lynq/lynq/auth";

const server = createMCPServer({ name: "my-server", version: "1.0.0" });

server.tool("secret", auth(), { description: "Protected tool" }, (args, ctx) => {
  return text("secret data");
});
```

## How it works

- **`onRegister` returns `false`** — the tool is hidden from the client on startup.
- **`ctx.session.authorize("auth")`** — reveals all `auth()`-guarded tools for this session and sends `tools/list_changed`.
- **`onCall` checks `ctx.session.get(sessionKey)`** — if the session key is missing, returns an error without calling the handler.

## Options

```ts
// Default: sessionKey = "user", generic error message
auth()

// Custom session key
auth({ sessionKey: "token" })

// Custom error message
auth({ message: "Please run the login tool first." })

// Both
auth({ sessionKey: "apiKey", message: "API key required." })
```

## Full auth flow

A login tool that authenticates the session, and a protected tool that becomes visible after login.

```ts
import { createMCPServer, text, error } from "@lynq/lynq";
import { auth } from "@lynq/lynq/auth";
import { z } from "zod";

const server = createMCPServer({ name: "my-server", version: "1.0.0" });

// Public — always visible
server.tool(
  "login",
  {
    description: "Authenticate with username and password",
    input: { username: z.string(), password: z.string() },
  },
  (args, ctx) => {
    if (args.username === "admin" && args.password === "secret") {
      // Store user info in session
      ctx.session.set("user", { username: args.username });
      // Reveal all auth()-guarded tools for this session
      ctx.session.authorize("auth");
      return text("Logged in.");
    }
    return error("Invalid credentials.");
  },
);

// Hidden until authorize("auth") is called
server.tool(
  "get-secrets",
  auth(),
  {
    description: "Retrieve secret data",
    input: { key: z.string() },
  },
  (args, ctx) => {
    const user = ctx.session.get<{ username: string }>("user");
    return text(`Secret for ${user?.username}: ${args.key}=42`);
  },
);

// Also hidden — same auth() middleware
server.tool(
  "delete-secrets",
  auth(),
  { description: "Delete secret data" },
  (_args, ctx) => {
    ctx.session.revoke("auth");
    return text("Logged out. Tools hidden again.");
  },
);
```

**Session timeline:**

1. Client connects. Sees only `login`.
2. Client calls `login` with valid credentials. Server sends `tools/list_changed`.
3. Client sees `login`, `get-secrets`, `delete-secrets`.
4. Client calls `delete-secrets`. Server revokes auth, sends `tools/list_changed`.
5. Client sees only `login` again.
