import { defineConfig } from "tsup";

export default defineConfig({
	entry: {
		index: "src/index.ts",
		"middleware/auth": "src/middleware/auth.ts",
		"adapters/stdio": "src/adapters/stdio.ts",
	},
	external: ["@modelcontextprotocol/sdk", "zod"],
	format: ["esm"],
	dts: true,
	clean: true,
	minify: true,
	treeshake: true,
	splitting: true,
	target: "es2022",
	outExtension: () => ({ js: ".mjs" }),
});
