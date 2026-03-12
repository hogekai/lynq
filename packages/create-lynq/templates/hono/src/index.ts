import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createMCPServer } from "@lynq/lynq";
import { guard } from "@lynq/lynq/guard";
import { mountLynq } from "@lynq/hono";
import { z } from "zod";

const mcp = createMCPServer({ name: "my-server", version: "1.0.0" });

// Public tool — always visible
mcp.tool(
	"login",
	{
		description: "Login with credentials",
		input: z.object({ username: z.string(), password: z.string() }),
	},
	async (args, ctx) => {
		if (args.username === "admin" && args.password === "secret") {
			ctx.session.set("user", { name: args.username });
			ctx.session.authorize("guard");
			return ctx.text(`Welcome, ${args.username}.`);
		}
		return ctx.error("Invalid credentials.");
	},
);

// Protected tool — hidden until login
mcp.tool(
	"search",
	guard(),
	{
		description: "Search (requires login)",
		input: z.object({ query: z.string() }),
	},
	async (args, ctx) => ctx.text(`Results for: ${args.query}`),
);

const app = new Hono();
mountLynq(app, mcp);

serve({ fetch: app.fetch, port: 3000 }, () => {
	console.log("MCP server running on http://localhost:3000/mcp");
});
