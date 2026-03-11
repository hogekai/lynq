import { describe, it, expect, afterEach } from "vitest";
import { createMCPServer } from "@lynq/lynq";
import { guard } from "@lynq/lynq/guard";
import { createTestClient } from "@lynq/lynq/test";
import { z } from "zod";

const mcp = createMCPServer({ name: "test", version: "1.0.0" });

mcp.tool(
	"login",
	{
		description: "Login",
		input: z.object({ username: z.string() }),
	},
	async (args, ctx) => {
		ctx.session.set("user", { name: args.username });
		ctx.session.authorize("guard");
		return ctx.text(`Welcome, ${args.username}`);
	},
);

mcp.tool(
	"search",
	guard(),
	{
		description: "Search",
		input: z.object({ query: z.string() }),
	},
	async (args, ctx) => ctx.text(`Results: ${args.query}`),
);

describe("MCP Server", () => {
	let t: Awaited<ReturnType<typeof createTestClient>>;

	afterEach(async () => {
		await t?.close();
	});

	it("search is hidden before login", async () => {
		t = await createTestClient(mcp);
		const tools = await t.listTools();
		expect(tools).toContain("login");
		expect(tools).not.toContain("search");
	});

	it("search appears after login", async () => {
		t = await createTestClient(mcp);
		await t.callTool("login", { username: "admin" });
		const tools = await t.listTools();
		expect(tools).toContain("search");
	});

	it("search returns results", async () => {
		t = await createTestClient(mcp);
		await t.callTool("login", { username: "admin" });
		const result = await t.callToolText("search", { query: "test" });
		expect(result).toContain("Results: test");
	});
});
