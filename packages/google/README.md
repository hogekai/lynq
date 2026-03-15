# @lynq/google

Google OAuth provider for [lynq](https://www.npmjs.com/package/@lynq/lynq) MCP framework.

## Install

```sh
npm install @lynq/google @lynq/lynq
```

## Usage

```ts
import { createMCPServer } from "@lynq/lynq";
import { google } from "@lynq/google";

const server = createMCPServer({ name: "my-server", version: "1.0.0" });

server.tool("private-data", google({
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  redirectUri: "http://localhost:3000/lynq/auth/google/callback",
}), {
  description: "Access private data",
}, async (args, c) => {
  const user = c.session.get("user");
  return c.text(`Hello, ${user.name}`);
});
```

### With Hono adapter

```ts
import { mountLynq } from "@lynq/hono";

mountLynq(app, server, {
  pages: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
});
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `clientId` | `string` | required | Google OAuth client ID |
| `clientSecret` | `string` | required | Google OAuth client secret |
| `redirectUri` | `string` | required | OAuth callback URL |
| `scopes` | `string[]` | `["openid", "profile", "email"]` | Google OAuth scopes |
| `sessionKey` | `string` | `"user"` | Session key to store user data |
| `message` | `string` | `"Please sign in with Google to continue."` | Elicitation message |
| `timeout` | `number` | `300000` | Elicitation timeout (ms) |
| `skipIf` | `(c) => boolean` | — | Skip middleware conditionally |
| `onComplete` | `(c) => void` | — | Run after successful auth |

## Documentation

[https://hogekai.github.io/lynq/](https://hogekai.github.io/lynq/)

## License

MIT
