# Create a Project

`create-lynq` scaffolds a new lynq MCP server project with a single command.

## Usage

::: code-group

```sh [pnpm]
pnpm create lynq my-server
```

```sh [npm]
npm create lynq my-server
```

```sh [yarn]
yarn create lynq my-server
```

```sh [bun]
bunx create-lynq my-server
```

:::

The CLI will prompt you to choose a template.

## Templates

### minimal

Stdio transport with a single tool. The simplest possible lynq server.

```
my-server/
├── src/
│   └── index.ts
├── package.json
├── tsconfig.json
└── .mcp.json
```

```ts
// src/index.ts
import { createMCPServer } from "@lynq/lynq";
import { z } from "zod";

const server = createMCPServer({ name: "my-server", version: "1.0.0" });

server.tool(
  "hello",
  {
    description: "Say hello",
    input: z.object({ name: z.string() }),
  },
  async (args, ctx) => ctx.text(`Hello, ${args.name}!`),
);

await server.stdio();
```

Start it:

```sh
cd my-server
pnpm install
pnpm dev
```

The `.mcp.json` is included — add it to Claude Code and the tool is immediately available.

### hono

HTTP transport with [Hono](/adapters/hono), `guard()` middleware, and a login flow.

```
my-server/
├── src/
│   └── index.ts
├── package.json
├── tsconfig.json
└── .env.example
```

Includes a public `login` tool and a guarded `search` tool that appears only after authentication.

```sh
cd my-server
pnpm install
pnpm dev
# MCP server running on http://localhost:3000/mcp
```

### full

Everything: Hono + [GitHub OAuth](/auth/github) + [Stripe Checkout](/payment/stripe) + [Store](/concepts/store) + [logger](/middleware/logger) + [rateLimit](/middleware/rate-limit) + tests.

```
my-server/
├── src/
│   └── index.ts
├── tests/
│   └── server.test.ts
├── package.json
├── tsconfig.json
└── .env.example
```

Copy `.env.example` to `.env` and fill in your credentials:

```sh
cp .env.example .env
```

The test file demonstrates [createTestClient](/guides/testing) for verifying tool visibility and responses.

## Flags

Skip the interactive prompt with `--template`:

::: code-group

```sh [pnpm]
pnpm create lynq my-server --template=minimal
```

```sh [npm]
npm create lynq my-server -- --template=minimal
```

```sh [yarn]
yarn create lynq my-server --template=minimal
```

```sh [bun]
bunx create-lynq my-server --template=minimal
```

:::

## Next Steps

- [Quick Start](/getting-started/quick-start) — understand the basics
- [Middleware](/concepts/middleware) — the middleware model
- [Hono Adapter](/adapters/hono) — deploy over HTTP
- [Testing](/guides/testing) — test your MCP server
