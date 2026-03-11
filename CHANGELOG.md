# Changelog

All notable changes to this project will be documented in this file.

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
