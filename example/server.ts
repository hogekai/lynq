import { z } from "zod";
import { createMCPServer } from "../src/core.js";
import { guard } from "../src/middleware/guard.js";

const server = createMCPServer({ name: "lynq-demo", version: "1.0.0" });

// Always visible — the only way in
server.tool(
	"login",
	{
		description: "Login with username and password",
		input: z.object({
			username: z.string(),
			password: z.string(),
		}),
	},
	async (args, ctx) => {
		if (args.username === "admin" && args.password === "1234") {
			ctx.session.set("user", { name: args.username });
			ctx.session.authorize("guard");
			return ctx.text(
				`Welcome, ${args.username}. You now have access to weather and notes tools.`,
			);
		}
		return ctx.error("Invalid credentials.");
	},
);

// Hidden until authenticated
server.tool(
	"get_weather",
	guard(),
	{
		description: "Get current weather for a city",
		input: z.object({
			city: z.string().describe("City name"),
		}),
	},
	async (args, ctx) => {
		// Fake weather data
		const conditions = ["Sunny", "Cloudy", "Rainy", "Snowy"];
		const temp = Math.floor(Math.random() * 35) + 5;
		const condition =
			conditions[Math.floor(Math.random() * conditions.length)];
		return ctx.text(`${args.city}: ${temp}°C, ${condition}`);
	},
);

// Hidden until authenticated
server.tool(
	"save_note",
	guard(),
	{
		description: "Save a note to memory",
		input: z.object({
			title: z.string().describe("Note title"),
			content: z.string().describe("Note content"),
		}),
	},
	async (args, ctx) => {
		const notes =
			ctx.session.get<Array<{ title: string; content: string }>>("notes") ??
			[];
		notes.push({ title: args.title, content: args.content });
		ctx.session.set("notes", notes);
		return ctx.text(`Saved note "${args.title}" (${notes.length} total).`);
	},
);

// Hidden until authenticated — exposes saved notes as a resource
server.resource(
	"notes://list",
	guard(),
	{
		name: "Saved Notes",
		description: "All notes saved in this session",
		mimeType: "application/json",
	},
	async (_uri, ctx) => {
		const notes =
			ctx.session.get<Array<{ title: string; content: string }>>("notes") ?? [];
		return { text: JSON.stringify(notes) };
	},
);

// Hidden until authenticated — elicitation example
server.tool(
	"configure",
	guard(),
	{
		description: "Configure your preferences (demonstrates elicitation)",
		input: z.object({}),
	},
	async (_args, ctx) => {
		const result = await ctx.elicit.form(
			"Set your preferences",
			z.object({
				theme: z.enum(["light", "dark"]).describe("Color theme"),
				language: z.string().describe("Preferred language"),
			}),
		);

		if (result.action !== "accept") {
			return ctx.text("Configuration cancelled.");
		}

		ctx.session.set("preferences", result.content);
		return ctx.text(`Preferences saved: ${JSON.stringify(result.content)}`);
	},
);

// Hidden until authenticated — async task example
server.task(
	"slow_analysis",
	guard(),
	{
		description: "Run a slow data analysis (demonstrates async tasks)",
		input: z.object({ query: z.string() }),
	},
	async (args, ctx) => {
		ctx.task.progress(0, "Starting analysis...");
		await new Promise((r) => setTimeout(r, 2000));
		ctx.task.progress(50, "Halfway...");
		await new Promise((r) => setTimeout(r, 2000));
		ctx.task.progress(100, "Complete");
		return ctx.text(`Analysis result for: ${args.query}`);
	},
);

// Hidden until authenticated — roots example
server.tool(
	"check_roots",
	guard(),
	{
		description: "List client-provided filesystem roots",
		input: z.object({}),
	},
	async (_args, ctx) => {
		const roots = await ctx.roots();
		if (roots.length === 0) {
			return ctx.text("No roots provided by client");
		}
		const list = roots
			.map((r) => `${r.name ?? "unnamed"}: ${r.uri}`)
			.join("\n");
		return ctx.text(`Available roots:\n${list}`);
	},
);

// Hidden until authenticated — sampling example
server.tool(
	"ask_model",
	guard(),
	{
		description: "Ask the client's LLM a question (demonstrates sampling)",
		input: z.object({ question: z.string().describe("Question to ask") }),
	},
	async (args, ctx) => {
		const answer = await ctx.sample(args.question, {
			system: "You are a helpful assistant. Be concise.",
			maxTokens: 256,
		});
		return ctx.text(answer);
	},
);

await server.stdio();
