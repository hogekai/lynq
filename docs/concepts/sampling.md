# Sampling

Request LLM inference from the client during tool execution. The client decides which model to use.

## Simple API

```ts
server.tool(
  "classify",
  {
    description: "Classify text sentiment",
    input: z.object({ text: z.string() }),
  },
  async (args, c) => {
    const sentiment = await c.sample(args.text, {
      system: "Respond with exactly one word: positive, negative, or neutral.",
      maxTokens: 10,
    });
    return c.text(`Sentiment: ${sentiment}`);
  },
);
```

`c.sample(prompt, options?)` sends a prompt and returns the response as a string.

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxTokens` | `number` | `1024` | Maximum tokens in the response |
| `model` | `string` | -- | Model hint (client decides) |
| `system` | `string` | -- | System prompt |
| `temperature` | `number` | -- | Sampling temperature |
| `stopSequences` | `string[]` | -- | Stop sequences |

## Raw API

For full control over the SDK's `CreateMessageRequestParams`:

```ts
const result = await c.sample.raw({
  messages: [
    { role: "user", content: { type: "text", text: "Hello" } },
  ],
  maxTokens: 256,
});
// result: CreateMessageResult — full SDK response with content, model, stopReason
```

Use `c.sample.raw()` when you need:
- Multi-turn conversations (multiple messages)
- Access to `stopReason` or `model` in the response
- Non-text content types in the response

## Availability

Sampling is available in **tool handlers** and **task handlers**. It is **not** available in resource handlers (resources are read-only data and should not trigger LLM inference).

:::tip Under the hood
`c.sample()` calls the MCP SDK's `server.createMessage()`, which sends a `sampling/createMessage` request to the client. The client chooses which model to invoke -- the `model` option is a hint, not a command. The response content is extracted: if `content.type === "text"`, the text string is returned; otherwise an empty string.
:::

## What's Next

- [Elicitation](/concepts/elicitation) -- request structured input from the user
- [Transports](/concepts/transports) -- stdio vs HTTP
