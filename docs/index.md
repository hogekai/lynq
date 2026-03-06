---
layout: home

hero:
  name: lynq
  tagline: Lightweight MCP server framework. Middleware for tool visibility.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: API Reference
      link: /api-reference/
    - theme: alt
      text: View on GitHub
      link: https://github.com/hogekai/lynq

features:
  - title: Session-Scoped Visibility
    details: Tools appear and disappear based on session state. authorize() triggers automatic client notification.
  - title: Hono-Style Middleware
    details: Global via server.use(), per-tool inline. onRegister, onCall, onResult hooks.
  - title: Test Helpers
    details: createTestClient() for in-memory testing. No transport setup. Custom matchers included.
  - title: Tiny Core
    details: ~680 lines. One peer dependency. ESM only. No config files.
---
