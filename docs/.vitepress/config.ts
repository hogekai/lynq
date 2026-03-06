import { defineConfig } from "vitepress";

export default defineConfig({
	title: "lynq",
	description:
		"Lightweight MCP server framework. Middleware for tool visibility.",
	base: "/lynq/",
	lang: "en-US",

	themeConfig: {
		nav: [
			{ text: "Getting Started", link: "/getting-started/quick-start" },
			{ text: "Concepts", link: "/concepts/middleware" },
			{ text: "API", link: "/api-reference/" },
		],

		sidebar: [
			{
				text: "Getting Started",
				items: [
					{ text: "MCP Overview", link: "/getting-started/mcp-overview" },
					{ text: "Quick Start", link: "/getting-started/quick-start" },
					{ text: "With Hono", link: "/getting-started/with-hono" },
					{ text: "With Express", link: "/getting-started/with-express" },
					{ text: "Claude Code", link: "/getting-started/claude-code" },
					{ text: "Why lynq", link: "/why-lynq" },
				],
			},
			{
				text: "Concepts",
				items: [
					{ text: "Middleware", link: "/concepts/middleware" },
					{
						text: "Session & Visibility",
						link: "/concepts/session-and-visibility",
					},
					{ text: "Elicitation", link: "/concepts/elicitation" },
					{ text: "Sampling", link: "/concepts/sampling" },
					{ text: "Tasks", link: "/concepts/tasks" },
					{ text: "Transports", link: "/concepts/transports" },
				],
			},
			{
				text: "Guides",
				items: [
					{ text: "Auth Flow", link: "/guides/auth-flow" },
					{ text: "Dynamic Tools", link: "/guides/dynamic-tools" },
					{ text: "Resource Gating", link: "/guides/resource-gating" },
					{
						text: "Custom Middleware",
						link: "/guides/custom-middleware",
					},
					{
						text: "Middleware Recipes",
						link: "/guides/middleware-recipes",
					},
					{ text: "Testing", link: "/guides/testing" },
				],
			},
			{
				text: "API",
				items: [
					{ text: "Overview", link: "/api/overview" },
					{ text: "Reference", link: "/api-reference/" },
				],
			},
		],

		socialLinks: [
			{ icon: "github", link: "https://github.com/hogekai/lynq" },
		],

		search: {
			provider: "local",
		},
	},
});
