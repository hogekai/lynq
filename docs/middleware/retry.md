# retry()

Automatic retry with configurable backoff. Retries on error results and thrown exceptions.

## Import

```ts
import { retry } from "@lynq/lynq/retry";
```

## Usage

```ts
server.tool("api-call", retry({ max: 3 }), config, handler);
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `max` | `number` | `3` | Maximum attempts (including the first) |
| `backoff` | `"exponential" \| "linear" \| "none"` | `"exponential"` | Backoff strategy |
| `delayMs` | `number` | `1000` | Base delay in milliseconds |
| `shouldRetry` | `(result) => boolean` | `r => r.isError === true` | Custom retry condition |

## Backoff Strategies

| Strategy | Delay pattern (delayMs=1000) |
|----------|------------------------------|
| `exponential` | 0, 1000, 2000, 4000, ... |
| `linear` | 0, 1000, 2000, 3000, ... |
| `none` | 0, 0, 0, ... |

The first attempt has no delay. Subsequent attempts wait according to the strategy.

## Example

```ts
import { createMCPServer, text } from "@lynq/lynq";
import { retry } from "@lynq/lynq/retry";

const server = createMCPServer({ name: "my-app", version: "1.0.0" });

server.tool(
  "fetch-data",
  retry({ max: 3, backoff: "exponential", delayMs: 500 }),
  { description: "Fetch data from external API" },
  async (args) => {
    const res = await fetch(`https://api.example.com/data/${args.id}`);
    if (!res.ok) return error(`API error: ${res.status}`);
    return text(await res.text());
  },
);
```

If the handler returns `isError: true`, it retries up to 2 more times with exponential backoff (500ms, 1000ms). If all attempts fail, the last error result is returned.

## Error Handling

- **Error results** (`isError: true`): retried by default
- **Thrown exceptions**: caught and retried. If all attempts throw, the last exception is re-thrown
- **AbortSignal**: checked before each retry. If the client aborts, returns the last result immediately

## Custom Retry Condition

```ts
retry({
  max: 3,
  shouldRetry: (result) => {
    const text = (result.content as any)?.[0]?.text;
    return text?.includes("TEMPORARY_ERROR");
  },
})
```

## Placement

:::warning Important
`retry()` must be the **last** per-tool middleware (closest to the handler). It calls `next()` multiple times to re-execute the handler, which only works correctly when no other `onCall` middleware follows it in the chain.

```ts
// Correct
server.tool("api", guard(), rateLimit({ max: 10 }), retry(), config, handler);

// Wrong -- retry is not last
server.tool("api", retry(), rateLimit({ max: 10 }), config, handler);
```
:::

:::tip Under the hood
Uses the `onCall` hook only. Each retry re-invokes `next()`, which re-runs the handler and any `onResult` middleware. The `c.signal.aborted` check prevents retries after client disconnection.
:::
