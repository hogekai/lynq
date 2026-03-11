import { Hono } from "hono";
import { createMCPServer, text, json } from "@lynq/lynq";
import { guard } from "@lynq/lynq/guard";
import { logger } from "@lynq/lynq/logger";
import { rateLimit } from "@lynq/lynq/rate-limit";
import { github } from "@lynq/lynq/github";
import { stripe } from "@lynq/lynq/stripe";
import { mountLynq } from "@lynq/lynq/hono";
import { memoryStore } from "@lynq/lynq/store";
import { z } from "zod";

const mcp = createMCPServer({
	name: "my-server",
	version: "1.0.0",
	store: memoryStore(),
});

// Global middleware
mcp.use(logger());

// Public tool
mcp.tool(
	"login",
	{
		description: "Login with credentials",
		input: z.object({ username: z.string(), password: z.string() }),
	},
	async (args, ctx) => {
		if (args.username === "admin" && args.password === "secret") {
			ctx.session.set("user", { name: args.username, id: "1" });
			ctx.session.authorize("guard");
			return ctx.text(`Welcome, ${args.username}.`);
		}
		return ctx.error("Invalid credentials.");
	},
);

// GitHub OAuth protected tool
mcp.tool(
	"my_repos",
	github({
		clientId: process.env.GITHUB_CLIENT_ID!,
		clientSecret: process.env.GITHUB_CLIENT_SECRET!,
		redirectUri: "http://localhost:3000/lynq/auth/github/callback",
	}),
	{
		description: "List your GitHub repos",
		input: z.object({}),
	},
	async (_args, ctx) => ctx.json(ctx.session.get("user")),
);

// Rate-limited search
mcp.tool(
	"search",
	guard(),
	rateLimit({ max: 10, windowMs: 60_000 }),
	{
		description: "Search (login required, max 10/min)",
		input: z.object({ query: z.string() }),
	},
	async (args, ctx) => ctx.text(`Results for: ${args.query}`),
);

// Paid premium tool
mcp.tool(
	"premium",
	stripe({
		secretKey: process.env.STRIPE_SECRET_KEY!,
		baseUrl: "http://localhost:3000",
		amount: 100,
		description: "Premium feature access",
	}),
	{
		description: "Premium feature ($1.00)",
		input: z.object({ query: z.string() }),
	},
	async (args, ctx) => ctx.text(`Premium result: ${args.query}`),
);

const app = new Hono();
mountLynq(app, mcp, {
	pages: {
		github: {
			clientId: process.env.GITHUB_CLIENT_ID!,
			clientSecret: process.env.GITHUB_CLIENT_SECRET!,
		},
		stripe: {
			secretKey: process.env.STRIPE_SECRET_KEY!,
		},
	},
});

console.log("MCP server running on http://localhost:3000/mcp");
export default { port: 3000, fetch: app.fetch };
