# Middleware

lynq ships with 17 built-in middleware, each available from its own entry point.

## Built-in

| Middleware | Hook | Description | Import |
|---|---|---|---|
| [`guard()`](/middleware/guard) | onRegister + onCall | Session key visibility gate | `@lynq/lynq/guard` |
| [`credentials()`](/middleware/credentials) | onRegister + onCall | Form-based auth via elicitation | `@lynq/lynq/credentials` |
| [`logger()`](/middleware/logger) | onCall | Tool call logging with timing | `@lynq/lynq/logger` |
| [`rateLimit()`](/middleware/rate-limit) | onCall | Rate limiting (session or Store-based) | `@lynq/lynq/rate-limit` |
| [`cache()`](/middleware/cache) | onCall + onResult | Store-backed response caching | `@lynq/lynq/cache` |
| [`retry()`](/middleware/retry) | onCall | Automatic retry with backoff | `@lynq/lynq/retry` |
| [`truncate()`](/middleware/truncate) | onResult | Response text truncation | `@lynq/lynq/truncate` |
| [`some()` / `every()` / `except()`](/middleware/combine) | all | Middleware combinators | `@lynq/lynq/combine` |

## Auth Providers

| Middleware | Description | Import |
|---|---|---|
| [`bearer()`](/auth/bearer) | Bearer token verification | `@lynq/lynq/bearer` |
| [`jwt()`](/auth/jwt) | JWT verification (requires `jose`) | `@lynq/lynq/jwt` |
| [`github()`](/auth/github) | GitHub OAuth flow | `@lynq/lynq/github` |
| [`google()`](/auth/google) | Google OAuth flow | `@lynq/lynq/google` |
| [`oauth()`](/auth/overview) | Generic URL-based OAuth | `@lynq/lynq/oauth` |

## Payment Providers

| Middleware | Description | Import |
|---|---|---|
| [`payment()`](/payment/overview) | URL-based payment flow | `@lynq/lynq/payment` |

## Low-level

| Middleware | Description | Import |
|---|---|---|
| `urlAction()` | Base for URL elicitation flows | `@lynq/lynq/url-action` |

`urlAction()` is the foundation for `oauth()` and `payment()`. Use it directly only when building custom URL-based flows.

All URL-based middleware (`oauth`, `payment`, `stripe`, `crypto`, `github`, `google`) support `skipIf` and `onComplete` callbacks for custom persistence logic. See [Store — Without Store](/concepts/store#without-store).

## Quick Example

```ts
import { guard } from "@lynq/lynq/guard";
import { logger } from "@lynq/lynq/logger";
import { rateLimit } from "@lynq/lynq/rate-limit";
import { cache } from "@lynq/lynq/cache";

server.use(logger());
server.tool("search", guard(), rateLimit({ max: 10 }), cache({ ttl: 60 }), config, handler);
```

## What's Next

- [Middleware Concepts](/concepts/middleware) -- the three hooks and execution order
- [Custom Middleware](/middleware/custom) -- write your own
- [Lifecycle Hooks](/concepts/lifecycle) -- server and session events
