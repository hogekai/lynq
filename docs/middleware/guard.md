# guard()

Session key visibility gate. Tools are hidden until the session is authorized.

## Import

```ts
import { guard } from "@lynq/lynq/guard";
```

## Usage

```ts
server.tool("secret", guard(), config, handler);
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | `"guard"` | Middleware name for `authorize()` / `revoke()` |
| `sessionKey` | `string` | `"user"` | Session key to check |
| `message` | `string` | `"Authorization required."` | Error message when not authorized |

## Example

```ts
import { createMCPServer, text, error } from "@lynq/lynq";
import { guard } from "@lynq/lynq/guard";

const server = createMCPServer({ name: "my-app", version: "1.0.0" });

// Public — no middleware
server.tool(
  "login",
  { description: "Authenticate with username and password" },
  async (c) => {
    const { username, password } = c.params;
    const user = await db.findUser(username, password);
    if (!user) return error("Invalid credentials.");

    c.session.set("user", user);
    c.session.authorize("guard");
    return text(`Welcome, ${user.name}!`);
  },
);

// Protected — hidden until authorized
server.tool(
  "profile",
  guard(),
  { description: "View your profile" },
  async (c) => {
    const user = c.session.get("user");
    return text(`Name: ${user.name}, Email: ${user.email}`);
  },
);

// Logout — revokes visibility
server.tool(
  "logout",
  guard(),
  { description: "Log out" },
  async (c) => {
    c.session.revoke("guard");
    return text("Logged out.");
  },
);
```

Before login, `tools/list` returns only `login`. After the user calls `login` with valid credentials, `profile` and `logout` appear. Calling `logout` hides them again.

:::tip Under the hood
`onRegister()` returns `false`, which removes the tool from the initial `tools/list` response. When handler code calls `c.session.authorize("guard")`, lynq sends a `notifications/tools/list_changed` notification to the client, prompting it to re-fetch the tool list. The `onCall` hook checks `session.get(sessionKey)` and returns an error if the value is falsy -- this prevents direct calls to the tool even if a client ignores visibility.
:::
