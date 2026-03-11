# Elicitation

Request structured input from the user during tool execution. Two modes: form (structured data) and URL (external redirect).

## Form Mode

Ask the user to fill out a form defined by a Zod schema:

```ts
import { z } from "zod";

server.tool(
  "configure",
  { description: "Set your preferences" },
  async (_args, c) => {
    const result = await c.elicit.form(
      "Choose your preferences",
      z.object({
        theme: z.enum(["light", "dark"]).describe("Color theme"),
        language: z.string().describe("Preferred language"),
      }),
    );

    if (result.action !== "accept") {
      return c.text("Configuration cancelled.");
    }

    c.session.set("preferences", result.content);
    return c.text(`Saved: ${JSON.stringify(result.content)}`);
  },
);
```

`c.elicit.form(message, zodSchema)` takes positional arguments -- message first, Zod schema second.

### Return Value

```ts
{
  action: "accept" | "decline" | "cancel";
  content: z.infer<typeof schema>;  // populated when action is "accept"
}
```

### Handling Decline and Cancel

Users can decline (explicit rejection) or cancel (close/dismiss). Handle both:

```ts
const result = await c.elicit.form("Enter settings", schema);

switch (result.action) {
  case "accept":
    // result.content has the form data
    return c.text(`Saved: ${JSON.stringify(result.content)}`);
  case "decline":
    return c.text("You declined. Using defaults.");
  case "cancel":
    return c.text("Cancelled.");
}
```

## URL Mode

Direct the user to an external URL (OAuth, payment, etc.):

```ts
const result = await c.elicit.url(
  "Please authorize with GitHub",
  "https://github.com/login/oauth/authorize?client_id=...",
);

if (result.action === "accept") {
  // User completed the external flow
}
```

### Waiting for External Completion

For flows where an external service needs to call back (OAuth, payment), use `waitForCompletion`:

```ts
const result = await c.elicit.url(
  "Complete payment",
  `https://pay.example.com/checkout?session=${c.sessionId}`,
  { waitForCompletion: true, timeout: 300_000 },
);
```

The promise won't resolve until `server.completeElicitation(elicitationId)` is called from your HTTP callback route, or the timeout expires.

### URL Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `elicitationId` | `string` | Random UUID | Pre-generated ID for callback matching |
| `waitForCompletion` | `boolean` | `false` | Wait for `completeElicitation()` before resolving |
| `timeout` | `number` | `300000` (5 min) | Timeout in ms for waiting |

### When to Use Which

| Mode | Use case |
|------|----------|
| `form` | Structured data: settings, preferences, confirmations |
| `url` | External flows: OAuth, payments, document signing |

:::tip Under the hood
`c.elicit.form()` converts the Zod schema to JSON Schema via `inputToJsonSchema()`, then calls the MCP SDK's `server.elicitInput()`. The client renders the schema as a form and returns the user's input. The `url` variant sets `mode: "url"` and directs the client to open an external URL. Both use the `elicitation/create` JSON-RPC method.
:::

## What's Next

- [Sampling](/concepts/sampling) -- request LLM inference from the client
- [API Overview](/api/overview) -- full context API at a glance
