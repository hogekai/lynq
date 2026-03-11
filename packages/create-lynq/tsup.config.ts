import { defineConfig } from "tsup";

export default defineConfig({
	entry: { index: "src/index.ts" },
	format: ["esm"],
	clean: true,
	minify: true,
	target: "es2022",
	outExtension: () => ({ js: ".mjs" }),
	banner: { js: "#!/usr/bin/env node" },
});
