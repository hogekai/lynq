/**
 * Example: OAuth + Payment middleware with Hono
 *
 * Run: npx tsx example/http-auth-server.ts
 * Connect MCP client to http://localhost:3000/mcp
 */
import { Hono } from "hono";
import { createMCPServer } from "../src/index.js";
import { oauth } from "../src/middleware/oauth.js";
import { payment } from "../src/middleware/payment.js";
import { z } from "zod";

const mcp = createMCPServer({ name: "auth-demo", version: "1.0.0" });

// OAuth-protected tool
mcp.tool(
	"my_data",
	oauth({
		message: "Sign in to access your data",
		buildUrl: ({ sessionId, elicitationId }) =>
			`http://localhost:3000/login?session=${sessionId}&elicitation=${elicitationId}`,
	}),
	{ description: "Get your personal data", input: z.object({}) },
	async (_args, ctx) => {
		const user = ctx.session.get("user");
		return ctx.text(`Data for user: ${JSON.stringify(user)}`);
	},
);

// Payment-gated tool
mcp.tool(
	"premium",
	payment({
		message: "This costs $0.01",
		buildUrl: ({ sessionId, elicitationId }) =>
			`http://localhost:3000/pay?session=${sessionId}&elicitation=${elicitationId}`,
	}),
	{ description: "Premium feature", input: z.object({ query: z.string() }) },
	async (args, ctx) => {
		return ctx.text(`Premium result for: ${args.query}`);
	},
);

const handler = mcp.http();
const app = new Hono();
app.all("/mcp", (c) => handler(c.req.raw));

// Mock login page
app.get("/login", (c) => {
	const session = c.req.query("session");
	const elicitation = c.req.query("elicitation");
	return c.html(`
    <h1>Mock Login</h1>
    <form method="POST" action="/login">
      <input type="hidden" name="session" value="${session}" />
      <input type="hidden" name="elicitation" value="${elicitation}" />
      <button type="submit">Sign In</button>
    </form>
  `);
});

app.post("/login", async (c) => {
	const body = await c.req.parseBody();
	const sessionId = body.session as string;
	const elicitationId = body.elicitation as string;
	mcp.session(sessionId).set("user", { name: "demo" });
	mcp.completeElicitation(elicitationId);
	return c.html("<p>Logged in. Close this tab.</p>");
});

// Mock payment page
app.get("/pay", (c) => {
	const session = c.req.query("session");
	const elicitation = c.req.query("elicitation");
	return c.html(`
    <h1>Payment: $0.01</h1>
    <form method="POST" action="/pay">
      <input type="hidden" name="session" value="${session}" />
      <input type="hidden" name="elicitation" value="${elicitation}" />
      <button type="submit">Pay</button>
    </form>
  `);
});

app.post("/pay", async (c) => {
	const body = await c.req.parseBody();
	const sessionId = body.session as string;
	const elicitationId = body.elicitation as string;
	mcp.session(sessionId).set("payment", { paid: true });
	mcp.completeElicitation(elicitationId);
	return c.html("<p>Payment complete. Close this tab.</p>");
});

export default { port: 3000, fetch: app.fetch };
