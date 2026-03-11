# Auth Providers

Choose the right auth middleware for your use case:

| Scenario | Middleware | Transport |
|---|---|---|
| Manual login tool | [`guard()`](/middleware/guard) | stdio + HTTP |
| Form-based credentials | [`credentials()`](/middleware/credentials) | stdio + HTTP |
| Pre-shared bearer token | [`bearer()`](/auth/bearer) | HTTP |
| JWT (e.g., from Auth0) | [`jwt()`](/auth/jwt) | HTTP |
| GitHub sign-in | [`githubOAuth()`](/auth/github) | HTTP |
| Google sign-in | [`googleOAuth()`](/auth/google) | HTTP |
| Custom OAuth provider | `oauth()` | HTTP |

## stdio vs HTTP

**stdio** clients (Claude Desktop, Claude Code) communicate over stdin/stdout. They can display forms via [elicitation](/api/overview#elicitation) but cannot open browser URLs. Use `guard()` or `credentials()`.

**HTTP** clients send requests over the network. They support all auth strategies. Bearer tokens and JWTs are injected via the [`onRequest` hook](/adapters/http#onrequest-hook).

## Quick Comparison

| | `guard()` | `credentials()` | `bearer()` | `jwt()` | `githubOAuth()` | `googleOAuth()` |
|---|---|---|---|---|---|---|
| Peer deps | — | `zod` | — | `jose` | — | — |
| User interaction | Manual login tool | Elicitation form | None (header) | None (header) | Browser redirect | Browser redirect |
| Session key | Configurable | Configurable | `"user"` | `"user"` | `"user"` | `"user"` |
| Hides tools | Yes | Yes | Yes | Yes | Yes | Yes |

## What's Next

- [Auth Flow Guide](/guides/auth-flow) — patterns and sequence diagrams
- [bearer()](/auth/bearer) — token verification
- [jwt()](/auth/jwt) — JWT verification
- [GitHub OAuth](/auth/github) — GitHub sign-in
- [Google OAuth](/auth/google) — Google sign-in
