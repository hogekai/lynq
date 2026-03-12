# Google OAuth

Full OAuth flow with URL elicitation. The agent is directed to Google's authorization page, and a callback route completes the flow.

## Import

```ts
import { google, handleCallback } from "@lynq/google";
```

## Usage

```ts
server.tool("files", google({
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  redirectUri: CALLBACK_URL,
}), config, handler);
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | `"google"` | Middleware name |
| `clientId` | `string` | **(required)** | Google OAuth client ID |
| `clientSecret` | `string` | **(required)** | Google OAuth client secret |
| `redirectUri` | `string` | **(required)** | Your callback URL |
| `scopes` | `string[]` | `["openid", "profile", "email"]` | OAuth scopes |
| `sessionKey` | `string` | `"user"` | Session key for user data |
| `message` | `string` | `"Please sign in with Google to continue."` | Elicitation message |
| `timeout` | `number` | `300000` | Timeout in ms |

Google OAuth defaults to `["openid", "profile", "email"]` if no scopes are specified.

## Example

A full Hono example with MCP server, Google OAuth middleware, and callback route.

```ts
import { createMCPServer } from "@lynq/lynq";
import { google, handleCallback } from "@lynq/google";
import { Hono } from "hono";
import { z } from "zod";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const CALLBACK_URL = "http://localhost:3000/auth/google/callback";

const mcp = createMCPServer({ name: "demo", version: "1.0.0" });

mcp.tool(
  "drive_files",
  google({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri: CALLBACK_URL,
  }),
  { description: "List Google Drive files", input: z.object({}) },
  async (_args, c) => c.json(c.session.get("user")),
);

const app = new Hono();
const handler = mcp.http();
app.all("/mcp", (c) => handler(c.req.raw));

app.get("/auth/google/callback", async (c) => {
  const result = await handleCallback(
    mcp,
    { code: c.req.query("code")!, state: c.req.query("state")! },
    {
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      redirectUri: CALLBACK_URL,
    },
  );
  if (!result.success) return c.text(`Error: ${result.error}`, 400);
  return c.html("<p>Signed in! You can close this tab.</p>");
});

export default { port: 3000, fetch: app.fetch };
```

::: tip Under the hood
`google()` wraps `oauth()` which wraps `urlAction()`. Same flow as GitHub
OAuth: URL elicitation directs the agent to Google's authorization page. The
`state` parameter encodes `sessionId:elicitationId`. When the user authorizes,
Google redirects to your callback. `handleCallback()` exchanges the
authorization code for tokens, fetches user info from Google's userinfo endpoint,
stores it in the session under `sessionKey`, and calls
`server.completeElicitation()` to resolve the pending elicitation.
:::
