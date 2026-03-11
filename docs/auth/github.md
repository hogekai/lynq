# GitHub OAuth

Full OAuth flow with URL elicitation. The agent is directed to GitHub's authorization page, and a callback route completes the flow.

## Import

```ts
import { github, handleCallback } from "@lynq/lynq/github";
```

## Usage

```ts
server.tool("repos", github({
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  redirectUri: CALLBACK_URL,
}), config, handler);
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | `"github"` | Middleware name |
| `clientId` | `string` | **(required)** | GitHub OAuth app client ID |
| `clientSecret` | `string` | **(required)** | GitHub OAuth app client secret |
| `redirectUri` | `string` | **(required)** | Your callback URL |
| `scopes` | `string[]` | `[]` | OAuth scopes (e.g. `["read:user", "repo"]`) |
| `sessionKey` | `string` | `"user"` | Session key for user data |
| `message` | `string` | `"Please sign in with GitHub to continue."` | Elicitation message |
| `timeout` | `number` | `300000` | Timeout in ms |

## Example

A full Hono example with MCP server, GitHub OAuth middleware, and callback route.

```ts
import { createMCPServer } from "@lynq/lynq";
import { github, handleCallback } from "@lynq/lynq/github";
import { Hono } from "hono";
import { z } from "zod";

const CLIENT_ID = process.env.GITHUB_CLIENT_ID!;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET!;
const CALLBACK_URL = "http://localhost:3000/auth/github/callback";

const mcp = createMCPServer({ name: "demo", version: "1.0.0" });

mcp.tool(
  "my_repos",
  github({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri: CALLBACK_URL,
    scopes: ["read:user", "repo"],
  }),
  { description: "List your GitHub repos", input: z.object({}) },
  async (_args, c) => c.json(c.session.get("user")),
);

const app = new Hono();
const handler = mcp.http();
app.all("/mcp", (c) => handler(c.req.raw));

app.get("/auth/github/callback", async (c) => {
  const result = await handleCallback(
    mcp,
    { code: c.req.query("code")!, state: c.req.query("state")! },
    { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET },
  );
  if (!result.success) return c.text(`Error: ${result.error}`, 400);
  return c.html("<p>Signed in! You can close this tab.</p>");
});

export default { port: 3000, fetch: app.fetch };
```

::: tip Under the hood
`github()` wraps `oauth()` which wraps `urlAction()`. When a protected tool
is called, the middleware opens GitHub's authorization URL via URL elicitation.
The `state` parameter encodes `sessionId:elicitationId` so the callback can
locate the correct session. When the user authorizes, GitHub redirects to your
callback URL. `handleCallback()` exchanges the authorization code for an
access token, fetches user info from the GitHub API, stores it in the session
under `sessionKey`, and calls `server.completeElicitation()` to resolve the
pending elicitation. The tool then proceeds with the authenticated user context.
:::
