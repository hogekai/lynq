# API Overview

## Server

`createMCPServer(info)` returns an `MCPServer` instance.

| Method | Signature | Description |
|--------|-----------|-------------|
| `use` | `(middleware: ToolMiddleware) => void` | Register global middleware for all subsequent tools and tasks |
| `tool` | `(name, ...middlewares?, config, handler) => void` | Register a tool |
| `resource` | `(uri, ...middlewares?, config, handler) => void` | Register a resource |
| `task` | `(name, ...middlewares?, config, handler) => void` | Register a task (experimental) |
| `stdio` | `() => Promise<void>` | Start stdio transport |
| `http` | `(options?: HttpAdapterOptions) => (req: Request) => Promise<Response>` | Create Web Standard HTTP handler |

## Tool Context

Passed as the second argument to tool and task handlers.

| Property | Type | Description |
|----------|------|-------------|
| `toolName` | `string` | Name of the tool being called |
| `session` | `Session` | Session-scoped state and visibility control |
| `signal` | `AbortSignal` | Abort signal from the client |
| `sessionId` | `string` | Current session ID |
| `elicit` | `Elicit` | Request information from the user |
| `roots` | `() => Promise<RootInfo[]>` | Query client-provided filesystem roots |
| `sample` | `Sample` | Request LLM inference from the client |

Task handlers receive a `TaskContext` which extends `ToolContext` with:

| Property | Type | Description |
|----------|------|-------------|
| `task.progress` | `(percentage: number, message?: string) => void` | Report progress (0-100) |
| `task.cancelled` | `boolean` | True when the client has cancelled the task |

## Session

Available via `c.session` in all handlers.

| Method | Signature | Description |
|--------|-----------|-------------|
| `get` | `<T>(key: string) => T \| undefined` | Get a session-scoped value |
| `set` | `(key: string, value: unknown) => void` | Set a session-scoped value |
| `authorize` | `(middlewareName: string) => void` | Authorize a middleware, enabling guarded tools and resources |
| `revoke` | `(middlewareName: string) => void` | Revoke authorization, hiding guarded tools and resources |
| `enableTools` | `(...names: string[]) => void` | Enable specific tools by name |
| `disableTools` | `(...names: string[]) => void` | Disable specific tools by name |
| `enableResources` | `(...uris: string[]) => void` | Enable specific resources by URI |
| `disableResources` | `(...uris: string[]) => void` | Disable specific resources by URI |

All visibility changes trigger automatic `list_changed` notifications to the client.

## Middleware Hooks

`ToolMiddleware` objects can implement any combination of these hooks.

| Hook | Signature | Description |
|------|-----------|-------------|
| `name` | `string` | Unique identifier, used for `authorize()`/`revoke()` |
| `onRegister` | `(tool: ToolInfo) => boolean \| undefined` | Called at registration. Return `false` to hide initially |
| `onCall` | `(c: ToolContext, next: () => Promise<CallToolResult>) => Promise<CallToolResult>` | Called on invocation. Must call `next()` to continue |
| `onResult` | `(result: CallToolResult, c: ToolContext) => CallToolResult \| Promise<CallToolResult>` | Post-handler transform. Runs in reverse middleware order |

## HTTP Adapter Options

Passed to `server.http(options?)`.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sessionless` | `boolean` | `false` | New server+transport per request |
| `sessionIdGenerator` | `() => string` | `crypto.randomUUID()` | Custom session ID generator |
| `enableJsonResponse` | `boolean` | `false` | Return JSON instead of SSE streams |
| `onRequest` | `(req, sessionId, session) => void \| Promise<void>` | — | Called on each request after session is resolved |

## Elicitation

> For concepts and usage patterns, see [Elicitation](/concepts/elicitation).

Request structured input from the user during tool execution. Two modes: form (structured data) and URL (external redirect).

### Form Mode

```ts
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
```

`c.elicit.form(message, zodSchema)` takes positional arguments -- message first, Zod schema second.

Return value: `{ action: "accept" | "decline" | "cancel", content: z.infer<typeof schema> }`

### URL Mode

Direct the user to an external URL (OAuth, payment, etc.):

```ts
const result = await c.elicit.url(
  "Please authorize with GitHub",
  "https://github.com/login/oauth/authorize?client_id=...",
);
```

For flows where an external service needs to call back, use `waitForCompletion`:

```ts
const result = await c.elicit.url(
  "Complete payment",
  `https://pay.example.com/checkout?session=${c.sessionId}`,
  { waitForCompletion: true, timeout: 300_000 },
);
```

The promise resolves when `server.completeElicitation(elicitationId)` is called from your callback route, or the timeout expires.

### URL Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `elicitationId` | `string` | Random UUID | Pre-generated ID for callback matching |
| `waitForCompletion` | `boolean` | `false` | Wait for `completeElicitation()` before resolving |
| `timeout` | `number` | `300000` (5 min) | Timeout in ms for waiting |

| Mode | Use case |
|------|----------|
| `form` | Structured data: settings, preferences, confirmations |
| `url` | External flows: OAuth, payments, document signing |

## Sampling

> For concepts and usage patterns, see [Sampling](/concepts/sampling).

Request LLM inference from the client during tool execution. The client decides which model to use.

```ts
const sentiment = await c.sample(args.text, {
  system: "Respond with exactly one word: positive, negative, or neutral.",
  maxTokens: 10,
});
return c.text(`Sentiment: ${sentiment}`);
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxTokens` | `number` | `1024` | Maximum tokens in the response |
| `model` | `string` | — | Model hint (client decides) |
| `system` | `string` | — | System prompt |
| `temperature` | `number` | — | Sampling temperature |
| `stopSequences` | `string[]` | — | Stop sequences |

### Raw API

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

Sampling is available in **tool handlers** and **task handlers**. Not available in resource handlers.

## Tasks

> For concepts and usage patterns, see [Tasks](/concepts/tasks).
>
> **@experimental** -- `server.task()` depends on the MCP SDK's experimental Tasks API.

Tasks are long-running operations with progress reporting and cancellation. Same registration pattern as tools -- same middleware, same visibility system.

```ts
server.task(
  "analyze_data",
  {
    description: "Run a slow data analysis",
    input: z.object({ query: z.string() }),
  },
  async (args, c) => {
    c.task.progress(0, "Starting analysis...");
    await new Promise((r) => setTimeout(r, 2000));
    c.task.progress(50, "Halfway...");
    await new Promise((r) => setTimeout(r, 2000));
    c.task.progress(100, "Complete");
    return c.text(`Analysis result for: ${args.query}`);
  },
);
```

### TaskContext

| Property | Type | Description |
|----------|------|-------------|
| `task.progress` | `(percentage: number, message?: string) => void` | Report progress (0-100) with optional status message |
| `task.cancelled` | `boolean` | `true` when the client has cancelled this task |

Check `c.task.cancelled` periodically to respect client cancellation. Tasks use the same middleware system as tools -- `server.use()` applies to tasks, and per-task middleware works inline.

### Tasks vs Tools

| | Tools | Tasks |
|---|---|---|
| Duration | Short (synchronous feel) | Long-running |
| Progress | No | Yes (`c.task.progress()`) |
| Cancellation | Via `c.signal` (AbortSignal) | Via `c.task.cancelled` |
| Middleware | Same | Same |
| Visibility | Same | Same |

## Entry Points

| Import | Provides |
|--------|----------|
| `@lynq/lynq` | `createMCPServer`, `text`, `json`, `error`, `image`, all types |
| `@lynq/lynq/guard` | `guard()` visibility gate |
| `@lynq/lynq/credentials` | `credentials()` form-based auth |
| `@lynq/lynq/bearer` | `bearer()` Bearer token verification |
| `@lynq/lynq/jwt` | `jwt()` JWT verification |
| `@lynq/lynq/github` | `github()`, `handleCallback()` |
| `@lynq/lynq/google` | `google()`, `handleCallback()` |
| `@lynq/lynq/stripe` | `stripe()`, `handleCallback()` |
| `@lynq/lynq/crypto` | `crypto()`, `handleCallback()` |
| `@lynq/lynq/url-action` | `urlAction()` URL-based elicitation |
| `@lynq/lynq/oauth` | `oauth()` generic OAuth flow |
| `@lynq/lynq/payment` | `payment()` payment flow |
| `@lynq/lynq/logger` | `logger()` logging |
| `@lynq/lynq/rate-limit` | `rateLimit()` rate limiting |
| `@lynq/lynq/truncate` | `truncate()` response truncation |
| `@lynq/lynq/combine` | `some()`, `every()`, `except()` combinators |
| `@lynq/lynq/auth` | `auth()` (deprecated, use `guard()`) |
| `@lynq/lynq/stdio` | `StdioServerTransport` re-export |
| `@lynq/lynq/hono` | `mountLynq` for Hono |
| `@lynq/lynq/express` | `mountLynq` for Express |
| `@lynq/lynq/test` | `createTestClient`, matchers |
