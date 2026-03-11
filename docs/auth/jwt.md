# jwt()

JWT verification middleware that decodes and verifies JSON Web Tokens using `jose`.

## Import

```ts
import { jwt } from "@lynq/lynq/jwt";
```

## Install

`jose` is a peer dependency:

```sh
pnpm add jose
```

## Usage

```ts
server.tool("admin", jwt({ secret: process.env.JWT_SECRET! }), config, handler);
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | `"jwt"` | Middleware name |
| `secret` | `string` | &mdash; | Symmetric secret (HMAC). Provide **either** `secret` or `jwksUri` |
| `jwksUri` | `string` | &mdash; | JWKS endpoint URL for asymmetric verification (e.g. Auth0, Firebase) |
| `issuer` | `string` | &mdash; | Expected `iss` claim |
| `audience` | `string` | &mdash; | Expected `aud` claim |
| `validate` | `(payload) => unknown \| null \| Promise<unknown \| null>` | &mdash; | Additional payload validation |
| `tokenKey` | `string` | `"token"` | Session key for the raw token |
| `sessionKey` | `string` | `"user"` | Session key for the decoded payload |
| `message` | `string` | `"Invalid or expired JWT."` | Error message |

You must provide either `secret` or `jwksUri`.

## Example

### Symmetric (HMAC)

```ts
jwt({ secret: process.env.JWT_SECRET! })
```

### Asymmetric (JWKS)

```ts
jwt({ jwksUri: "https://your-tenant.auth0.com/.well-known/jwks.json" })
```

### With claim validation

```ts
jwt({
  secret: process.env.JWT_SECRET!,
  issuer: "https://your-tenant.auth0.com/",
  audience: "your-api",
  validate: async (payload) => {
    if (payload.role !== "admin") return null;
    return { id: payload.sub, role: payload.role };
  },
})
```

### Full working example

```ts
import { createMCPServer } from "@lynq/lynq";
import { jwt } from "@lynq/lynq/jwt";
import { z } from "zod";

const server = createMCPServer({ name: "api", version: "1.0.0" });

server.tool(
  "admin",
  jwt({
    jwksUri: "https://your-tenant.auth0.com/.well-known/jwks.json",
    issuer: "https://your-tenant.auth0.com/",
    audience: "your-api",
    validate: async (payload) => {
      if (payload.role !== "admin") return null;
      return { id: payload.sub, role: payload.role };
    },
  }),
  { description: "Admin action", input: z.object({ action: z.string() }) },
  async (args, c) => {
    const user = c.session.get("user");
    return c.text(`Admin ${user.id} ran ${args.action}`);
  },
);

const handler = server.http({
  onRequest(req, sessionId, session) {
    const auth = req.headers.get("Authorization");
    if (auth?.startsWith("Bearer ")) {
      session.set("token", auth.slice(7));
    }
  },
});
```

The `onRequest` hook bridges the HTTP `Authorization` header into the session,
the same pattern used by `bearer()`.

::: tip Under the hood
`jwt()` uses `onRegister() => false` to hide tools initially. On call, it reads
the token from the session, lazy-loads `jose`, and verifies the JWT with
`jwtVerify` (symmetric) or `createRemoteJWKSet` + `jwtVerify` (JWKS). If
`issuer` or `audience` are provided, they are checked against the token claims.
If a `validate()` function is provided, it runs against the decoded payload for
additional checks. On success the result is stored in `sessionKey` and
`authorize()` is called to reveal the tool.
:::
