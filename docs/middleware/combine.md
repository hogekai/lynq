# Combinators

Compose multiple middlewares with boolean logic.

## Import

```ts
import { some, every, except } from "@lynq/lynq/combine";
```

## `some()` -- first match wins

Run middlewares in order. The first one that calls `next()` wins. If all short-circuit, the last error is returned.

```ts
import { some } from "@lynq/lynq/combine";
import { guard } from "@lynq/lynq/guard";
import { credentials } from "@lynq/lynq/credentials";

// Allow access if EITHER already logged in OR submitting credentials
server.tool(
  "dashboard",
  some(
    guard(),
    credentials({
      message: "Login required",
      schema: z.object({ token: z.string() }),
      verify: async (fields) => validateToken(fields.token),
    }),
  ),
  { description: "View dashboard" },
  handler,
);
```

## `every()` -- all must pass

Run all middlewares in sequence. If any short-circuits, the chain stops.

```ts
import { every } from "@lynq/lynq/combine";
import { guard } from "@lynq/lynq/guard";
import { rateLimit } from "@lynq/lynq/rate-limit";

// Must be authenticated AND within rate limit
server.tool(
  "api",
  every(guard(), rateLimit({ max: 100 })),
  { description: "Call external API" },
  handler,
);
```

## `except()` -- conditional bypass

Skip a middleware when a condition is true.

```ts
import { except } from "@lynq/lynq/combine";
import { rateLimit } from "@lynq/lynq/rate-limit";

// Rate limit everyone except admins
server.tool(
  "search",
  except(
    (c) => c.session.get("role") === "admin",
    rateLimit({ max: 10 }),
  ),
  { description: "Search" },
  handler,
);
```

## Combining combinators

Combinators return `ToolMiddleware`, so they nest naturally:

```ts
import { some, every, except } from "@lynq/lynq/combine";
import { guard } from "@lynq/lynq/guard";
import { rateLimit } from "@lynq/lynq/rate-limit";

// Admins bypass rate limit; everyone else needs auth + rate limit
server.tool(
  "deploy",
  some(
    except((c) => c.session.get("role") !== "admin", guard()),
    every(guard(), rateLimit({ max: 5 })),
  ),
  { description: "Deploy to production" },
  handler,
);
```

:::tip Under the hood
`some()` tries each middleware's `onCall` sequentially, probing whether it calls `next()`. The first middleware that calls `next()` wins and its result is returned. `every()` chains all `onCall` hooks into a single sequence -- each must call `next()` for the chain to proceed. `except()` evaluates the predicate at call time and either runs or skips the wrapped middleware. All three compose `onRegister` and `onResult` hooks as well: `some()` and `every()` return `false` from `onRegister` if any inner middleware does, and `except()` delegates to the wrapped middleware's hooks.
:::
