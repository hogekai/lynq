# Sampling

Sampling lets your tool handler request LLM inference from the client. The client decides which model to use — your server provides the prompt.

## When to Use

Your MCP server doesn't have its own model access, but a tool needs LLM reasoning:

- Sentiment analysis on user-provided text
- Summarizing long content before returning it
- Classifying or categorizing data
- Generating descriptions from structured data

The key point: the **client** controls the model. Your `model` option is a hint, not a command.

## Simple API

`c.sample(prompt, options?)` sends text, gets text back.

```ts
server.tool(
  "sentiment",
  {
    description: "Analyze text sentiment",
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

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `maxTokens` | `number` | `1024` | Maximum tokens in the response |
| `model` | `string` | — | Model hint (client decides) |
| `system` | `string` | — | System prompt |
| `temperature` | `number` | — | Sampling temperature |
| `stopSequences` | `string[]` | — | Stop sequences |

## Raw API

`c.sample.raw(params)` gives full control over the SDK's `CreateMessageRequestParams`. Use it for multi-turn messages, image content, or when you need the full response metadata.

```ts
server.tool(
  "analyze",
  { description: "Analyze with context" },
  async (_args, c) => {
    const result = await c.sample.raw({
      messages: [
        { role: "user", content: { type: "text", text: "Summarize this data" } },
        { role: "assistant", content: { type: "text", text: "I need more context." } },
        { role: "user", content: { type: "text", text: "Here is the full dataset..." } },
      ],
      maxTokens: 256,
    });

    // result.content, result.model, result.stopReason
    return c.text(result.content.type === "text" ? result.content.text : "");
  },
);
```

## Simple vs Raw

| | `c.sample()` | `c.sample.raw()` |
|---|---|---|
| Input | String prompt | Full SDK `CreateMessageRequestParamsBase` |
| Output | `string` (text content) | `CreateMessageResult` (full response) |
| Multi-turn | No | Yes |
| Image content | No | Yes |
| Response metadata | No | Yes (`model`, `stopReason`) |

## Availability

| Handler | `c.sample` |
|---|---|
| Tool handler | Yes |
| Task handler | Yes |
| Resource handler | No |

Resources are read-only data lookups — no interactive capabilities like sampling or elicitation.

:::tip Under the hood
`c.sample()` wraps the SDK's `server.createMessage()`. It constructs a single user message from your prompt string and applies your options (system prompt, temperature, etc.). If the response content type is not text, it returns an empty string. `c.sample.raw()` passes your params directly to the SDK with no transformation.
:::

## What's Next

- [Elicitation](/concepts/elicitation) — ask the user for input
- [Tasks](/concepts/tasks) — long-running operations with progress
- [API Reference](/api/overview#sampling) — full options table
