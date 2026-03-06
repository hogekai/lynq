import { defineConfig } from "vitepress";

export default defineConfig({
	title: "lynq",
	description:
		"Lightweight MCP server framework. Middleware for tool visibility.",
	base: "/lynq/",
	lang: "en-US",

	themeConfig: {
		nav: [
			{ text: "Guide", link: "/getting-started" },
			{ text: "Middleware", link: "/middleware/auth" },
			{ text: "API", link: "/api-reference/" },
		],

		sidebar: [
			{
				text: "Guide",
				items: [
					{ text: "Getting Started", link: "/getting-started" },
					{ text: "Why lynq", link: "/why-lynq" },
				],
			},
			{
				text: "API",
				items: [
					{ text: "Overview", link: "/api/overview" },
					{ text: "Reference", link: "/api-reference/" },
				],
			},
			{
				text: "Middleware",
				items: [
					{ text: "auth()", link: "/middleware/auth" },
					{ text: "Custom Middleware", link: "/middleware/custom" },
					{ text: "Recipes", link: "/middleware/recipes" },
				],
			},
			{
				text: "Adapters",
				items: [
					{ text: "stdio", link: "/adapters/stdio" },
					{ text: "HTTP", link: "/adapters/http" },
					{ text: "Hono", link: "/adapters/hono" },
					{ text: "Express", link: "/adapters/express" },
				],
			},
			{
				text: "Patterns",
				items: [
					{ text: "Auth Flow", link: "/patterns/auth-flow" },
					{ text: "Dynamic Tools", link: "/patterns/dynamic-tools" },
					{
						text: "Resource Gating",
						link: "/patterns/resource-gating",
					},
					{ text: "Testing", link: "/patterns/testing" },
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
