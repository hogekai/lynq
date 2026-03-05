import { defineConfig } from "tsup";

export default defineConfig({
	entry: {
		index: "src/index.ts",
		"middleware/auth": "src/middleware/auth.ts",
		"adapters/stdio": "src/adapters/stdio.ts",
		"adapters/hono": "src/adapters/hono.ts",
		"adapters/express": "src/adapters/express.ts",
	},
	external: ["@modelcontextprotocol/sdk", "zod", "hono", "express"],
	format: ["esm"],
	dts: true,
	clean: true,
	minify: true,
	treeshake: true,
	splitting: true,
	target: "es2022",
	outExtension: () => ({ js: ".mjs" }),
});
