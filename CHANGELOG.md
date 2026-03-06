# Changelog

All notable changes to this project will be documented in this file.

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
