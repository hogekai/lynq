import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../src/core.js";
import { auth } from "../src/middleware/auth.js";
import { createTestClient, matchers } from "../src/test.js";

expect.extend(matchers);

function createTestServer() {
	return createMCPServer({ name: "test", version: "1.0.0" });
}

describe("createTestClient", () => {
	it("returns a connected test client", async () => {
		const server = createTestServer();
		server.tool("ping", {}, async () => ({
			content: [{ type: "text", text: "pong" }],
		}));

		const t = await createTestClient(server);
		expect(t).toBeDefined();
		expect(t.listTools).toBeTypeOf("function");
		expect(t.callTool).toBeTypeOf("function");
		expect(t.session).toBeDefined();
		await t.close();
	});

	it("listTools returns tool name array", async () => {
		const server = createTestServer();
		server.tool("alpha", {}, async () => ({
			content: [{ type: "text", text: "a" }],
		}));
		server.tool("beta", {}, async () => ({
			content: [{ type: "text", text: "b" }],
		}));

		const t = await createTestClient(server);
		const tools = await t.listTools();
		expect(tools).toContain("alpha");
		expect(tools).toContain("beta");
		await t.close();
	});

	it("callTool returns CallToolResult", async () => {
		const server = createTestServer();
		server.tool(
			"greet",
			{ input: z.object({ name: z.string() }) },
			async (args: any) => ({
				content: [{ type: "text", text: `Hello ${args.name}` }],
			}),
		);

		const t = await createTestClient(server);
		const result = await t.callTool("greet", { name: "World" });
		expect(result.content).toEqual([{ type: "text", text: "Hello World" }]);
		await t.close();
	});

	it("callToolText returns text string", async () => {
		const server = createTestServer();
		server.tool("echo", {}, async () => ({
			content: [{ type: "text", text: "hello" }],
		}));

		const t = await createTestClient(server);
		const text = await t.callToolText("echo");
		expect(text).toBe("hello");
		await t.close();
	});

	it("callToolText throws on error result", async () => {
		const server = createTestServer();
		server.tool("fail", {}, async () => ({
			content: [{ type: "text", text: "something broke" }],
			isError: true,
		}));

		const t = await createTestClient(server);
		await expect(t.callToolText("fail")).rejects.toThrow("something broke");
		await t.close();
	});

	it("authorize/revoke toggle tool visibility", async () => {
		const server = createTestServer();
		server.tool("secret", auth(), {}, async () => ({
			content: [{ type: "text", text: "ok" }],
		}));

		const t = await createTestClient(server);

		let tools = await t.listTools();
		expect(tools).not.toContain("secret");

		t.authorize("auth");
		tools = await t.listTools();
		expect(tools).toContain("secret");

		t.revoke("auth");
		tools = await t.listTools();
		expect(tools).not.toContain("secret");

		await t.close();
	});

	it("listResources returns URI array", async () => {
		const server = createTestServer();
		server.resource("config://settings", { name: "Settings" }, async () => ({
			text: "{}",
		}));

		const t = await createTestClient(server);
		const resources = await t.listResources();
		expect(resources).toContain("config://settings");
		await t.close();
	});

	it("readResource returns text content", async () => {
		const server = createTestServer();
		server.resource("config://settings", { name: "Settings" }, async () => ({
			text: '{"theme":"dark"}',
		}));

		const t = await createTestClient(server);
		const text = await t.readResource("config://settings");
		expect(text).toBe('{"theme":"dark"}');
		await t.close();
	});

	it("listResourceTemplates returns template URI array", async () => {
		const server = createTestServer();
		server.resource("file:///{path}", { name: "Files" }, async () => ({
			text: "",
		}));

		const t = await createTestClient(server);
		const templates = await t.listResourceTemplates();
		expect(templates).toContain("file:///{path}");
		await t.close();
	});

	it("close completes without error", async () => {
		const server = createTestServer();
		const t = await createTestClient(server);
		await expect(t.close()).resolves.toBeUndefined();
	});
});

describe("matchers", () => {
	it("toHaveTextContent passes when text matches", () => {
		const result = {
			content: [{ type: "text" as const, text: "sunny in Tokyo" }],
		};
		const { pass } = matchers.toHaveTextContent(result, "sunny");
		expect(pass).toBe(true);
	});

	it("toHaveTextContent fails when text does not match", () => {
		const result = {
			content: [{ type: "text" as const, text: "rainy" }],
		};
		const { pass } = matchers.toHaveTextContent(result, "sunny");
		expect(pass).toBe(false);
	});

	it("toBeError passes when isError is true", () => {
		const result = {
			content: [{ type: "text" as const, text: "err" }],
			isError: true as const,
		};
		const { pass } = matchers.toBeError(result);
		expect(pass).toBe(true);
	});

	it("toBeError fails when isError is not set", () => {
		const result = {
			content: [{ type: "text" as const, text: "ok" }],
		};
		const { pass } = matchers.toBeError(result);
		expect(pass).toBe(false);
	});
});
