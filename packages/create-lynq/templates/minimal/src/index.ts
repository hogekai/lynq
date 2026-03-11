import { createMCPServer } from "@lynq/lynq";
import { z } from "zod";

const server = createMCPServer({ name: "my-server", version: "1.0.0" });

server.tool(
	"hello",
	{
		description: "Say hello",
		input: z.object({ name: z.string() }),
	},
	async (args, ctx) => ctx.text(`Hello, ${args.name}!`),
);

await server.stdio();
