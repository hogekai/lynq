import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const TEMPLATES = ["minimal", "hono", "full"] as const;
type Template = (typeof TEMPLATES)[number];

const DESCRIPTIONS: Record<Template, string> = {
	minimal: "stdio + 1 tool. Simplest possible server.",
	hono: "Hono HTTP + guard + auth flow.",
	full: "Hono + GitHub OAuth + Stripe + Store + tests.",
};

async function main() {
	const args = process.argv.slice(2);

	// Project name
	let projectName = args[0];
	if (!projectName || projectName.startsWith("--")) {
		projectName = await ask("Project name: ");
	}
	if (!projectName) {
		console.error("Project name is required.");
		process.exit(1);
	}

	// Template selection
	let template: Template | undefined;
	const templateArg = args.find((a) => a.startsWith("--template="));
	if (templateArg) {
		template = templateArg.split("=")[1] as Template;
	}
	if (!template || !TEMPLATES.includes(template)) {
		console.log("\nTemplates:");
		for (const t of TEMPLATES) {
			console.log(`  ${t.padEnd(10)} — ${DESCRIPTIONS[t]}`);
		}
		const choice = await ask("\nTemplate: ");
		template = choice.trim() as Template;
		if (!TEMPLATES.includes(template)) {
			console.error(`Unknown template: ${choice}`);
			process.exit(1);
		}
	}

	// Create target directory
	const targetDir = path.resolve(process.cwd(), projectName);
	if (fs.existsSync(targetDir)) {
		console.error(`Directory ${projectName} already exists.`);
		process.exit(1);
	}

	// Copy template
	const __dirname = path.dirname(fileURLToPath(import.meta.url));
	const templateDir = path.resolve(__dirname, "../templates", template);
	copyDir(templateDir, targetDir);

	// Replace package name
	const pkgPath = path.join(targetDir, "package.json");
	const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
	pkg.name = projectName;
	fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

	console.log(`\n✓ Created ${projectName} (template: ${template})\n`);
	console.log("Next steps:\n");
	console.log(`  cd ${projectName}`);
	console.log("  pnpm install");
	console.log("  pnpm dev\n");
}

function ask(question: string): Promise<string> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer);
		});
	});
}

function copyDir(src: string, dest: string) {
	fs.mkdirSync(dest, { recursive: true });
	for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);
		if (entry.isDirectory()) {
			copyDir(srcPath, destPath);
		} else {
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

main().catch(console.error);
