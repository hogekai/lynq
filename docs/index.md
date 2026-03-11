---
layout: home

hero:
  name: lynq
  tagline: Session-aware MCP servers. Declare visibility rules as middleware.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/quick-start
    - theme: alt
      text: Why lynq
      link: /why-lynq
    - theme: alt
      text: View on GitHub
      link: https://github.com/hogekai/lynq

features:
  - title: Session-Scoped Visibility
    details: Tools appear after login, hide on logout. authorize() notifies the client automatically — no manual sendToolListChanged.
  - title: Hono-Style Middleware
    details: Global via server.use(), per-tool inline. Three hooks — onRegister, onCall, onResult. Pure objects, no classes.
  - title: Built-in Middleware
    details: guard() · bearer() · jwt() · github() · google() · rateLimit() · logger() · truncate() · credentials() — compose freely.
  - title: Framework Agnostic
    details: server.http() returns a standard (Request) => Response handler. Mount in Hono, Express, Deno, Cloudflare Workers.
  - title: Test Helpers
    details: createTestClient() for in-memory testing. No transport setup. Assert visibility, call tools, inspect results.
  - title: Tiny Core
    details: One dependency. ESM only. No config files, no directory scanning, no magic.
---

<div class="quick-look">

## Quick Look

```ts
server.tool("login", config, handler);            // always visible
server.tool("weather", guard(), config, handler);  // hidden until authorized
// Client gets notified automatically. No manual wiring.
```

<div style="margin-top: 1rem; font-size: 1.1em;">

[Get Started](/getting-started/quick-start) | [Why lynq](/why-lynq)

</div>
</div>

<style>
.quick-look {
  max-width: 688px;
  margin: 2rem auto;
  padding: 0 1.5rem;
}
</style>
