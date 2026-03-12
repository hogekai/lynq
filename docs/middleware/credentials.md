# credentials()

Form-based authentication via elicitation. Tools are hidden until the user submits valid credentials.

## Import

```ts
import { credentials } from "@lynq/lynq/credentials";
```

## Usage

```ts
import { z } from "zod";

server.tool(
  "dashboard",
  credentials({
    message: "Login required",
    schema: z.object({ username: z.string(), password: z.string() }),
    verify: async (fields) => {
      const user = await db.findUser(fields.username, fields.password);
      return user ?? null;
    },
  }),
  config,
  handler,
);
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | `"credentials"` | Middleware name for `authorize()` / `revoke()` |
| `message` | `string` | (required) | Message shown in the elicitation form |
| `schema` | `z.ZodObject` | (required) | Zod schema defining form fields |
| `verify` | `(fields) => Promise<unknown \| null>` | (required) | Return user data or `null` to reject |
| `sessionKey` | `string` | `"user"` | Session key to store verified user |

::: info Peer dependency
`credentials()` requires `zod` as a peer dependency. Install it alongside lynq:

::: code-group

```sh [pnpm]
pnpm add zod
```

```sh [npm]
npm install zod
```

```sh [yarn]
yarn add zod
```

```sh [bun]
bun add zod
```

:::
:::

## Example

```ts
import { createMCPServer, text } from "@lynq/lynq";
import { credentials } from "@lynq/lynq/credentials";
import { z } from "zod";

const server = createMCPServer({ name: "my-app", version: "1.0.0" });

const loginForm = credentials({
  message: "Please enter your credentials to continue.",
  schema: z.object({
    username: z.string().min(1),
    password: z.string().min(8),
  }),
  verify: async (fields) => {
    const user = await db.authenticate(fields.username, fields.password);
    return user ?? null; // null rejects with "Invalid credentials."
  },
});

server.tool(
  "account-settings",
  loginForm,
  { description: "View and edit account settings" },
  async (c) => {
    const user = c.session.get("user");
    return text(`Logged in as ${user.name}. Email: ${user.email}`);
  },
);

server.tool(
  "billing",
  loginForm,
  { description: "View billing history" },
  async (c) => {
    const user = c.session.get("user");
    const invoices = await db.getInvoices(user.id);
    return text(JSON.stringify(invoices));
  },
);
```

Both tools are hidden until the user authenticates. The first call to either tool triggers the elicitation form. Once verified, both tools become visible and subsequent calls skip the form.

:::tip Under the hood
`onRegister()` returns `false` to hide tools from the initial `tools/list`. On the first call, the `onCall` hook checks `session.get(sessionKey)`. If absent, it calls `c.elicit.form(message, schema)` to prompt the user for input. If the user accepts and `verify()` returns a non-null value, the result is stored in the session and `authorize(name)` is called, which triggers `notifications/tools/list_changed`. If the user cancels or `verify()` returns `null`, an error is returned and the tool remains hidden.
:::
