# Elicitation

Request structured input from the user during tool execution. Two modes: form (structured data) and URL (external redirect).

## Form Mode

Ask the user to fill out a form defined by a Zod schema:

```ts
import { z } from "zod";

server.tool(
  "configure",
  { description: "Set your preferences" },
  async (_args, ctx) => {
    const result = await ctx.elicit.form(
      "Choose your preferences",
      z.object({
        theme: z.enum(["light", "dark"]).describe("Color theme"),
        language: z.string().describe("Preferred language"),
      }),
    );

    if (result.action !== "accept") {
      return ctx.text("Configuration cancelled.");
    }

    ctx.session.set("preferences", result.content);
    return ctx.text(`Saved: ${JSON.stringify(result.content)}`);
  },
);
```

`ctx.elicit.form(message, zodSchema)` takes positional arguments -- message first, Zod schema second.

### Return Value

```ts
{
  action: "accept" | "decline" | "cancel";
  content: z.infer<typeof schema>;  // populated when action is "accept"
}
```

## URL Mode

Direct the user to an external URL (OAuth, payment, etc.):

```ts
const result = await ctx.elicit.url(
  "Please authorize with GitHub",
  "https://github.com/login/oauth/authorize?client_id=...",
);

if (result.action === "accept") {
  // User completed the external flow
}
```

### When to Use Which

| Mode | Use case |
|------|----------|
| `form` | Structured data: settings, preferences, confirmations |
| `url` | External flows: OAuth, payments, document signing |

:::tip Under the hood
`ctx.elicit.form()` converts the Zod schema to JSON Schema via `inputToJsonSchema()`, then calls the MCP SDK's `server.elicitInput()`. The client renders the schema as a form and returns the user's input. The `url` variant sets `mode: "url"` and directs the client to open an external URL. Both use the `elicitation/create` JSON-RPC method.
:::

## What's Next

- [Sampling](/concepts/sampling) -- request LLM inference from the client
- [API Overview](/api/overview) -- full context API at a glance
