# Changelog

All notable changes to this project will be documented in this file.

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
