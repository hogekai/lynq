# @lynq/github

GitHub OAuth provider for [lynq](https://www.npmjs.com/package/@lynq/lynq) MCP framework.

## Install

```sh
npm install @lynq/github @lynq/lynq
```

## Usage

```ts
import { createMCPServer } from "@lynq/lynq";
import { github } from "@lynq/github";

const server = createMCPServer({ name: "my-server", version: "1.0.0" });

server.tool("private-data", github({
  clientId: process.env.GITHUB_CLIENT_ID!,
  clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  redirectUri: "http://localhost:3000/lynq/auth/github/callback",
}), {
  description: "Access private data",
}, async (args, c) => {
  const user = c.session.get("user");
  return c.text(`Hello, ${user.login}`);
});
```

### With Hono adapter

```ts
import { mountLynq } from "@lynq/hono";

mountLynq(app, server, {
  pages: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
});
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `clientId` | `string` | required | GitHub OAuth App client ID |
| `clientSecret` | `string` | required | GitHub OAuth App client secret |
| `redirectUri` | `string` | required | OAuth callback URL |
| `scopes` | `string[]` | `[]` | GitHub OAuth scopes |
| `sessionKey` | `string` | `"user"` | Session key to store user data |
| `message` | `string` | `"Please sign in with GitHub to continue."` | Elicitation message |
| `timeout` | `number` | `300000` | Elicitation timeout (ms) |
| `skipIf` | `(c) => boolean` | — | Skip middleware conditionally |
| `onComplete` | `(c) => void` | — | Run after successful auth |

## Documentation

[https://hogekai.github.io/lynq/](https://hogekai.github.io/lynq/)

## License

MIT
