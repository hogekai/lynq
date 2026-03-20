# Changelog

All notable changes to this project will be documented in this file.

## [0.13.0] - 2026-03-20

### Breaking Changes

- Rename `[x-lynq-payment]` elicitation tag to `[x-agent-payment]` per Agent Payment Protocol specification
- Rename `_lynq_payment` receipt key to `_agent_payment`

## [0.12.1] - 2026-03-17

### Changed

- Document `agentPayment` `receipt` option and auto-append payment receipt behavior

## [0.12.0] - 2026-03-17

### Added

- `agentPayment` auto-appends `_lynq_payment` receipt to tool results by default — service MCP authors get payment info passed to agents without custom `onResult` hooks
- `receipt` option on `agentPayment` (`boolean`, default: `true`) — set `false` to disable automatic receipt

## [0.11.3] - 2026-03-17

### Fixed

- Parse tool arguments through Zod schema when `input` has a `parse` method, enabling validation before middleware and handlers

## [0.11.2] - 2026-03-17

### Fixed

- Scope `persistTimers` per server instance — previously shared across all `createMCPServer()` instances, causing cross-server timer leakage

## [0.11.1] - 2026-03-17

### Fixed

- Middleware error boundary — `await` the `onCall` return value so async rejections are caught by the `try/catch`
- Middleware error boundary — re-throw errors after `onError` instead of swallowing them as error responses

## [0.11.0] - 2026-03-17

### Added

- `onError` callback option — surfaces previously swallowed errors from lifecycle hooks, SDK notifications, middleware, and task updates
- `sessionPersistence` option — persist session state (grants, data, overrides) to the Store for restoration after reconnect or server restart
- `sessionTTL` option (default: 3600s) — automatic session expiration with lazy cleanup on access and periodic sweep in HTTP adapter
- Middleware error boundary — `onCall`/`onResult` errors are caught and reported via `onError` instead of crashing; `McpError` is re-thrown
- Explicit type overloads for `tool()`, `resource()`, `task()` with 1–3 middlewares for better IDE autocomplete

### Fixed

- Rate-limit atomicity — in-process mutex prevents concurrent requests from bypassing store-based rate limits
- CSS deduplication in HTML page templates via shared `BASE_STYLES` constant

## [0.10.0] - 2026-03-17

### Added

- `Elicit.form()` raw JSON Schema overload — pass plain `Record<string, unknown>` instead of Zod
- `parsePaymentMeta()` export from `lynq/agent-payment` — extract `[x-lynq-payment:{json}]` metadata from elicitation messages
- `agentPayment()` embeds payment metadata in elicitation message via `[x-lynq-payment]` tag

### Changed

- `agentPayment()` uses raw JSON Schema instead of lazy Zod import — no `zod` peer dependency needed

## [0.9.0] - 2026-03-16

### Added

- `agentPayment()` middleware — agent-to-agent payment flow with on-chain and facilitator verification (`lynq/agent-payment`)

## [0.8.4] - 2026-03-15

### Added

- README.md for all packages (npm listing)

## [0.8.3] - 2026-03-15

### Fixed

- `memoryStore`: fix LRU eviction logic for correct least-recently-used behavior
- `verifyState`: colon-safe parsing for state tokens containing colons
- Task tracking: proper `drain()` support for waiting on running tasks
- Template pattern: prevent path traversal in scaffold templates
- `session.destroy()`: correctly clear session data on destroy
- `http()`: hoist lazy import cache to `createHttpAdapter` scope (avoid redundant imports)
- Unified error handling across tool/resource/task handlers
- Stabilized cache middleware keys for consistent cache hits

### Changed

- Test internals extracted to `internals.ts` export for cleaner test helper API
- Added HTTP adapter tests for session lifecycle and error cases

## [0.8.2] - 2026-03-12

### Fixed

- `memoryStore`: sweep expired keys on `set()` when entry count exceeds 1000 (prevents unbounded growth)
- `http()`: add `srv.onclose` fallback cleanup for HTTP sessions when `onsessionclosed` doesn't fire

### Changed

- Document `onCall` contract: middleware must `return await next()` — calling `next()` without returning its result is undefined behavior
- Document `@experimental` task limitation: running tasks are fire-and-forget with no graceful shutdown guarantee

## [0.8.1] - 2026-03-12

### Fixed

- Fire `onSessionDestroy` on transport close for stdio/non-HTTP sessions
- CI: run build before typecheck/test for cross-package resolution
- Docs: add install sections for `@lynq/github`, `@lynq/google`, `@lynq/stripe`, `@lynq/crypto`

## [0.8.0] - 2026-03-12

### Breaking Changes

- **Monorepo split by peer dependency boundary.** Providers, adapters, and store implementations are now separate packages:
  - `@lynq/github` — GitHub OAuth provider (was `@lynq/lynq/github`)
  - `@lynq/google` — Google OAuth provider (was `@lynq/lynq/google`)
  - `@lynq/stripe` — Stripe Checkout provider (was `@lynq/lynq/stripe`)
  - `@lynq/crypto` — Crypto payment provider (was `@lynq/lynq/crypto`)
  - `@lynq/hono` — Hono adapter (was `@lynq/lynq/hono`)
  - `@lynq/express` — Express adapter (was `@lynq/lynq/express`)
- Removed deprecated aliases: `lynq/github-oauth`, `lynq/google-oauth`, `lynq/usdc`
- Removed subpath exports: `./github`, `./google`, `./stripe`, `./crypto`, `./hono`, `./express`

### Added

- `@lynq/store-redis` — Redis-backed Store implementation (peer dep: `ioredis`)
- `@lynq/store-sqlite` — SQLite-backed Store implementation (peer dep: `better-sqlite3`)
- `@lynq/lynq/helpers` subpath — `signState`, `verifyState`, `validateHost`, `LOCALHOST_HOSTS`
- `@lynq/lynq/pages` subpath — HTML templates and types for adapter page routes
- `cache()` middleware — response caching with TTL (`@lynq/lynq/cache`)
- `retry()` middleware — automatic retry with configurable strategy (`@lynq/lynq/retry`)

### Changed

- Core `@lynq/lynq` no longer has `hono`, `express`, `stripe` as peer dependencies
- Release workflow publishes all scoped packages on `v*` tags
- Docs use VitePress code groups (tabs) for install commands

### Migration

```diff
- import { github } from "@lynq/lynq/github"
+ import { github } from "@lynq/github"

- import { mountLynq } from "@lynq/lynq/hono"
+ import { mountLynq } from "@lynq/hono"
```

## [create-lynq 0.1.1] - 2026-03-11

### Fixed

- Add `@hono/node-server` + `serve()` to hono/full templates (was Bun-only)
- Fix `listToolNames()` → `listTools()` in full template test

## [0.7.1] - 2026-03-11

### Fixed

- Add `type: module` to root `package.json` for VitePress ESM compatibility

## [0.7.0] - 2026-03-11

### Added

- pnpm workspace monorepo migration (`packages/lynq/`, `packages/create-lynq/`)
- `create-lynq` CLI — scaffold new lynq projects with `pnpm create lynq`
- Three project templates: `minimal` (stdio), `hono` (HTTP + guard), `full` (GitHub OAuth + Stripe + Store + tests)
- Docs: "Create a Project" getting started page

### Changed

- Source moved from root `src/` to `packages/lynq/src/`
- CI workflows updated for monorepo (`pnpm -r build`, `pnpm -r test`)
- Release workflow supports per-package publishing (`v*` for lynq, `create-lynq-v*` for create-lynq)

## [0.6.0] - 2026-03-11

### Added

- Docs: Elicitation concept page — form mode (Zod schemas, result handling) and URL mode (waitForCompletion, callback flow, sequence diagram)
- Docs: Sampling concept page — simple API, raw API, availability matrix
- Docs: Tasks concept page — progress reporting, cancellation, middleware integration
- Docs: Expanded MCP Overview with URL elicitation, sampling raw API, and tasks sections
- Docs: Cross-links from existing concept pages to new Elicitation, Sampling, Tasks pages

## [0.5.0] - 2026-03-11

### Added

- `Store` abstraction for persistent state across connections (`memoryStore()` default)
- `c.store` (global) and `c.userStore` (user-scoped) KV stores in tool/resource/task handlers
- `stripe()` + `handleCallback()` — Stripe Checkout payment provider
- `crypto()` + `handleCallback()` — crypto payment provider (replaces `usdcPayment`)
- `tip()` middleware — post-result tip link appender via `onResult`
- `persistent` option for `urlAction`, `oauth`, `payment` — state via `c.userStore` instead of session
- `skipIf` / `onComplete` hooks for all URL-based middleware — custom persistence without Store
- Adapter `pages` option — `mountLynq(app, server, { pages: { ... } })` auto-registers OAuth/payment callback routes + success pages
- Docs: Store concept page, payment section (Stripe, crypto, tip), middleware overview

### Changed

- Unified middleware naming — dropped domain suffixes: `githubOAuth()` → `github()`, `googleOAuth()` → `google()`, `stripePayment()` → `stripe()`, `usdcPayment()` → `crypto()`
- Deprecated aliases added for old names (`lynq/github-oauth`, `lynq/google-oauth`, `lynq/usdc`)
- `buildUrl` in `urlAction`/`oauth`/`payment` now supports async functions
- Docs restructured into middleware, auth, payment, adapters sections

## [0.4.0] - 2026-03-11

### Added

- `guard()` middleware — visibility gate (replaces deprecated `auth()`)
- `credentials()` middleware — form-based authentication via elicitation
- `logger()` middleware — request/response logging
- `rateLimit()` middleware — per-session rate limiting
- `truncate()` middleware — response truncation
- `some()`, `every()`, `except()` — middleware combinators
- `urlAction()` middleware — URL-based elicitation with completion tracking
- `oauth()` middleware — OAuth flow via elicitation
- `payment()` middleware — payment flow via elicitation
- `bearer()` middleware — Bearer token verification
- `jwt()` middleware — JWT verification (requires `jose` peer dep)
- `githubOAuth()` + `handleGitHubCallback()` — GitHub OAuth provider
- `googleOAuth()` + `handleGoogleCallback()` — Google OAuth provider
- `onRequest` hook for `server.http()` — inject HTTP headers into MCP sessions

### Changed

- Renamed context parameter from `ctx` to `c` for Hono-style brevity
- Docs overhauled for new middleware and API style

## [0.3.0] - 2026-03-06

### Added

- Response helpers: `text()`, `json()`, `error()`, `image()` as standalone pure functions
- Chainable response builder via `response()` for composing multi-content results
- Response helpers injected into ToolContext (`ctx.text`, `ctx.json`, `ctx.error`, `ctx.image`)
- Docs restructured for framework-oriented navigation

## [0.2.0] - 2026-03-06

### Added

- VitePress documentation site with 14 pages (Guide, Middleware, Adapters, Patterns)
- TypeDoc API reference auto-generation
- GitHub Pages deployment workflow (`.github/workflows/docs.yml`)

## [0.1.0] - 2025-06-01

### Added

- `createMCPServer()` — core server factory
- `server.tool()` — tool registration with per-tool middleware
- `server.resource()` — resource registration with middleware and visibility control
- `server.task()` — async task support (experimental, uses MCP Tasks draft spec)
- `server.use()` — global middleware
- `server.stdio()` — stdio transport
- `server.http()` — HTTP transport (Web Standard Request/Response)
- `ctx.session` — session-scoped state and visibility control (authorize/revoke)
- `ctx.elicit.form()` / `ctx.elicit.url()` — user information request
- `ctx.roots()` — client filesystem boundaries
- `ctx.sample()` — LLM sampling via client
- `auth()` middleware — tool/resource visibility gating
- `onResult` middleware hook — response transformation
- `lynq/test` — test helpers (`createTestClient`, custom matchers)
- `lynq/hono` — Hono adapter with DNS rebinding protection
- `lynq/express` — Express adapter
