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

## Entry Points

| Import | Provides |
|--------|----------|
| `@lynq/lynq` | `createMCPServer`, `text`, `json`, `error`, `image`, all types |
| `@lynq/lynq/guard` | `guard()` middleware |
| `@lynq/lynq/auth` | `auth()` middleware (deprecated, use `@lynq/lynq/guard`) |
| `@lynq/lynq/stdio` | `StdioServerTransport` re-export |
| `@lynq/lynq/hono` | `mountLynq` for Hono |
| `@lynq/lynq/express` | `mountLynq` for Express |
| `@lynq/lynq/test` | `createTestClient`, matchers |
