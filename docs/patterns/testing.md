# Testing

MCP server testing is painful — transport wiring, SDK client setup, content extraction boilerplate. `@lynq/lynq/test` reduces it to a few lines.

## Before / After

**Before** (manual setup):

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: "test", version: "1.0.0" });
await Promise.all([server._server.connect(serverTransport), client.connect(clientTransport)]);
const result = await client.callTool({ name: "ping", arguments: {} });
const text = result.content[0].text;
```

**After** (`@lynq/lynq/test`):

```ts
import { createTestClient } from "@lynq/lynq/test";

const t = await createTestClient(server);
const text = await t.callToolText("ping");
```

## Setup

```ts
import { describe, expect, it, afterEach } from "vitest";
import { createMCPServer } from "@lynq/lynq";
import { createTestClient, matchers } from "@lynq/lynq/test";

expect.extend(matchers);

let t: Awaited<ReturnType<typeof createTestClient>>;

afterEach(async () => {
  await t?.close();
});
```

## Visibility Testing

```ts
import { auth } from "@lynq/lynq/auth";

it("auth-guarded tools are hidden then revealed", async () => {
  const server = createMCPServer({ name: "test", version: "1.0.0" });
  server.tool("public", {}, async () => ({
    content: [{ type: "text", text: "ok" }],
  }));
  server.tool("secret", auth(), {}, async () => ({
    content: [{ type: "text", text: "classified" }],
  }));

  t = await createTestClient(server);

  let tools = await t.listTools();
  expect(tools).toContain("public");
  expect(tools).not.toContain("secret");

  t.authorize("auth");
  tools = await t.listTools();
  expect(tools).toContain("secret");

  t.revoke("auth");
  tools = await t.listTools();
  expect(tools).not.toContain("secret");
});
```

## Tool Execution

```ts
import { z } from "zod";

it("callTool returns the full result", async () => {
  const server = createMCPServer({ name: "test", version: "1.0.0" });
  server.tool(
    "greet",
    { input: z.object({ name: z.string() }) },
    async (args) => ({
      content: [{ type: "text", text: `Hello ${args.name}` }],
    }),
  );

  t = await createTestClient(server);
  const result = await t.callTool("greet", { name: "World" });
  expect(result.content).toEqual([{ type: "text", text: "Hello World" }]);
});

it("callToolText extracts text and throws on errors", async () => {
  const server = createMCPServer({ name: "test", version: "1.0.0" });
  server.tool("echo", {}, async () => ({
    content: [{ type: "text", text: "hello" }],
  }));
  server.tool("fail", {}, async () => ({
    content: [{ type: "text", text: "something broke" }],
    isError: true,
  }));

  t = await createTestClient(server);
  expect(await t.callToolText("echo")).toBe("hello");
  await expect(t.callToolText("fail")).rejects.toThrow("something broke");
});
```

## Resource Testing

```ts
it("lists and reads resources", async () => {
  const server = createMCPServer({ name: "test", version: "1.0.0" });
  server.resource("config://settings", { name: "Settings" }, async () => ({
    text: '{"theme":"dark"}',
  }));
  server.resource("file:///{path}", { name: "Files" }, async () => ({
    text: "",
  }));

  t = await createTestClient(server);

  const resources = await t.listResources();
  expect(resources).toContain("config://settings");

  const templates = await t.listResourceTemplates();
  expect(templates).toContain("file:///{path}");

  const text = await t.readResource("config://settings");
  expect(text).toBe('{"theme":"dark"}');
});
```

## Custom Matchers

Register `matchers` from `@lynq/lynq/test` with `expect.extend()` for readable assertions on `CallToolResult` objects.

```ts
import { matchers } from "@lynq/lynq/test";

expect.extend(matchers);

it("toHaveTextContent checks for substring", async () => {
  const server = createMCPServer({ name: "test", version: "1.0.0" });
  server.tool("weather", {}, async () => ({
    content: [{ type: "text", text: "sunny in Tokyo" }],
  }));

  t = await createTestClient(server);
  const result = await t.callTool("weather");
  expect(result).toHaveTextContent("sunny");
});

it("toBeError checks isError flag", async () => {
  const server = createMCPServer({ name: "test", version: "1.0.0" });
  server.tool("fail", {}, async () => ({
    content: [{ type: "text", text: "denied" }],
    isError: true,
  }));

  t = await createTestClient(server);
  const result = await t.callTool("fail");
  expect(result).toBeError();
});
```

## Cleanup

Always close the test client to release the in-memory transport.

```ts
afterEach(async () => {
  await t?.close();
});
```

## TestClient API Reference

| Method | Returns | Description |
|---|---|---|
| `listTools()` | `Promise<string[]>` | Visible tool names |
| `callTool(name, args?)` | `Promise<CallToolResult>` | Full tool result |
| `callToolText(name, args?)` | `Promise<string>` | First text content; throws on error |
| `listResources()` | `Promise<string[]>` | Visible resource URIs |
| `listResourceTemplates()` | `Promise<string[]>` | Visible template URIs |
| `readResource(uri)` | `Promise<string>` | Resource text content |
| `authorize(name)` | `void` | Grant a middleware |
| `revoke(name)` | `void` | Revoke a middleware |
| `session` | `Session` | Direct session access |
| `close()` | `Promise<void>` | Clean up transport |
