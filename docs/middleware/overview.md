# Middleware

lynq ships with 15 built-in middleware, each available from its own entry point.

## Built-in

| Middleware | Hook | Description | Import |
|---|---|---|---|
| [`guard()`](/middleware/guard) | onRegister + onCall | Session key visibility gate | `@lynq/lynq/guard` |
| [`credentials()`](/middleware/credentials) | onRegister + onCall | Form-based auth via elicitation | `@lynq/lynq/credentials` |
| [`logger()`](/middleware/logger) | onCall | Tool call logging with timing | `@lynq/lynq/logger` |
| [`rateLimit()`](/middleware/rate-limit) | onCall | Session-scoped rate limiting | `@lynq/lynq/rate-limit` |
| [`truncate()`](/middleware/truncate) | onResult | Response text truncation | `@lynq/lynq/truncate` |
| [`some()` / `every()` / `except()`](/middleware/combine) | all | Middleware combinators | `@lynq/lynq/combine` |

## Auth Providers

| Middleware | Description | Import |
|---|---|---|
| [`bearer()`](/auth/bearer) | Bearer token verification | `@lynq/lynq/bearer` |
| [`jwt()`](/auth/jwt) | JWT verification (requires `jose`) | `@lynq/lynq/jwt` |
| [`githubOAuth()`](/auth/github) | GitHub OAuth flow | `@lynq/lynq/github-oauth` |
| [`googleOAuth()`](/auth/google) | Google OAuth flow | `@lynq/lynq/google-oauth` |
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

## Quick Example

```ts
import { guard } from "@lynq/lynq/guard";
import { logger } from "@lynq/lynq/logger";
import { rateLimit } from "@lynq/lynq/rate-limit";

server.use(logger());
server.tool("search", guard(), rateLimit({ max: 10 }), config, handler);
```

## What's Next

- [Middleware Concepts](/concepts/middleware) — the three hooks and execution order
- [Custom Middleware](/middleware/custom) — write your own
