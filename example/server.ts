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
	async (args, c) => {
		if (args.username === "admin" && args.password === "1234") {
			c.session.set("user", { name: args.username });
			c.session.authorize("guard");
			return c.text(
				`Welcome, ${args.username}. You now have access to weather and notes tools.`,
			);
		}
		return c.error("Invalid credentials.");
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
	async (args, c) => {
		// Fake weather data
		const conditions = ["Sunny", "Cloudy", "Rainy", "Snowy"];
		const temp = Math.floor(Math.random() * 35) + 5;
		const condition =
			conditions[Math.floor(Math.random() * conditions.length)];
		return c.text(`${args.city}: ${temp}°C, ${condition}`);
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
	async (args, c) => {
		const notes =
			c.session.get<Array<{ title: string; content: string }>>("notes") ??
			[];
		notes.push({ title: args.title, content: args.content });
		c.session.set("notes", notes);
		return c.text(`Saved note "${args.title}" (${notes.length} total).`);
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
	async (_uri, c) => {
		const notes =
			c.session.get<Array<{ title: string; content: string }>>("notes") ?? [];
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
	async (_args, c) => {
		const result = await c.elicit.form(
			"Set your preferences",
			z.object({
				theme: z.enum(["light", "dark"]).describe("Color theme"),
				language: z.string().describe("Preferred language"),
			}),
		);

		if (result.action !== "accept") {
			return c.text("Configuration cancelled.");
		}

		c.session.set("preferences", result.content);
		return c.text(`Preferences saved: ${JSON.stringify(result.content)}`);
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
	async (args, c) => {
		c.task.progress(0, "Starting analysis...");
		await new Promise((r) => setTimeout(r, 2000));
		c.task.progress(50, "Halfway...");
		await new Promise((r) => setTimeout(r, 2000));
		c.task.progress(100, "Complete");
		return c.text(`Analysis result for: ${args.query}`);
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
	async (_args, c) => {
		const roots = await c.roots();
		if (roots.length === 0) {
			return c.text("No roots provided by client");
		}
		const list = roots
			.map((r) => `${r.name ?? "unnamed"}: ${r.uri}`)
			.join("\n");
		return c.text(`Available roots:\n${list}`);
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
	async (args, c) => {
		const answer = await c.sample(args.question, {
			system: "You are a helpful assistant. Be concise.",
			maxTokens: 256,
		});
		return c.text(answer);
	},
);

await server.stdio();
