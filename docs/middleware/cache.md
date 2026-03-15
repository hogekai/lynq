# cache()

Store-backed response caching per tool. Cached results are returned from the Store without executing the handler.

## Import

```ts
import { cache } from "@lynq/lynq/cache";
```

## Usage

```ts
server.tool("weather", cache({ ttl: 300 }), config, handler);
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ttl` | `number` | (required) | Cache TTL in seconds |
| `key` | `(toolName, args) => string` | `cache:${toolName}:${stableStringify(args)}` | Custom cache key builder. Default uses stable serialization (key-order independent) |

## How It Works

1. **`onCall`**: Checks `c.store` for a cached result using the computed key. If found, returns it immediately (handler is skipped).
2. **`onResult`**: If the handler returned a non-error result, writes it to `c.store` with the configured TTL.

Error results (`isError: true`) are never cached.

## Example

```ts
import { createMCPServer, text } from "@lynq/lynq";
import { cache } from "@lynq/lynq/cache";

const server = createMCPServer({ name: "my-app", version: "1.0.0" });

// Cache weather lookups for 5 minutes
server.tool(
  "weather",
  cache({ ttl: 300 }),
  { description: "Get current weather" },
  async (args) => {
    const data = await fetchWeather(args.city);
    return text(JSON.stringify(data));
  },
);
```

The first call for `{ city: "tokyo" }` executes the handler. Subsequent calls with the same arguments return the cached result until the TTL expires.

## Custom Key

By default, the cache key includes the tool name and serialized arguments. Override this to control cache granularity:

```ts
// Cache per tool only (ignore arguments)
cache({ ttl: 60, key: (name) => `cache:${name}` })

// Cache per user + tool
cache({
  ttl: 60,
  key: (name, args) => `cache:${args.userId}:${name}`,
})
```

## c.args

`cache()` uses `c.args` -- the tool arguments available on the context object. This property is available to all middleware in `onCall` and `onResult` hooks.

:::tip Under the hood
Uses both `onCall` and `onResult` hooks. Cache state is stored in `c.store` (global persistent Store), not `c.session`. This means cached results survive reconnections and are shared across all sessions. Different arguments produce different cache keys by default.
:::
