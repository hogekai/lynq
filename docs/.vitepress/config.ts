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
			{ text: "Middleware", link: "/middleware/overview" },
			{ text: "API", link: "/api-reference/" },
		],

		sidebar: [
			{
				text: "Introduction",
				items: [
					{ text: "Why lynq", link: "/why-lynq" },
					{
						text: "MCP Overview",
						link: "/getting-started/mcp-overview",
					},
					{
						text: "Quick Start",
						link: "/getting-started/quick-start",
					},
					{
						text: "Claude Code",
						link: "/getting-started/claude-code",
					},
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
					{
						text: "Store & Persistence",
						link: "/concepts/store",
					},
					{ text: "Transports", link: "/concepts/transports" },
				],
			},
			{
				text: "Middleware",
				items: [
					{ text: "Overview", link: "/middleware/overview" },
					{ text: "guard()", link: "/middleware/guard" },
					{ text: "logger()", link: "/middleware/logger" },
					{ text: "rateLimit()", link: "/middleware/rate-limit" },
					{ text: "truncate()", link: "/middleware/truncate" },
					{ text: "combine()", link: "/middleware/combine" },
					{
						text: "credentials()",
						link: "/middleware/credentials",
					},
					{ text: "Custom", link: "/middleware/custom" },
				],
			},
			{
				text: "Auth Providers",
				items: [
					{ text: "Overview", link: "/auth/overview" },
					{ text: "bearer()", link: "/auth/bearer" },
					{ text: "jwt()", link: "/auth/jwt" },
					{ text: "GitHub OAuth", link: "/auth/github" },
					{ text: "Google OAuth", link: "/auth/google" },
				],
			},
			{
				text: "Payment Providers",
				items: [
					{ text: "Overview", link: "/payment/overview" },
					{
						text: "Stripe Checkout",
						link: "/payment/stripe",
					},
					{ text: "USDC", link: "/payment/usdc" },
					{ text: "tip()", link: "/payment/tip" },
				],
			},
			{
				text: "Adapters",
				items: [
					{ text: "Hono", link: "/adapters/hono" },
					{ text: "Express", link: "/adapters/express" },
					{ text: "HTTP (raw)", link: "/adapters/http" },
				],
			},
			{
				text: "Guides",
				items: [
					{ text: "Auth Flow", link: "/guides/auth-flow" },
					{
						text: "Dynamic Tools",
						link: "/guides/dynamic-tools",
					},
					{
						text: "Resource Gating",
						link: "/guides/resource-gating",
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
