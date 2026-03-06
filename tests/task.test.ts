import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../src/core.js";
import { auth } from "../src/middleware/auth.js";
import { text, error } from "../src/response.js";
import { createTestClient } from "../src/test.js";

function createTestServer() {
	return createMCPServer({ name: "test", version: "1.0.0" }) as any;
}

describe("task() registration", () => {
	it("registers a task", () => {
		const server = createTestServer();
		server.task(
			"deploy",
			{ description: "Deploy", input: z.object({ branch: z.string() }) },
			async () => text("done"),
		);
		expect(server._isTaskVisible("deploy", "default")).toBe(true);
	});

	it("registers a task with middleware", () => {
		const server = createTestServer();
		server.task("deploy", auth(), { description: "Deploy" }, async () =>
			text("done"),
		);
		expect(server._isTaskVisible("deploy", "default")).toBe(false);
	});
});

describe("task visibility", () => {
	it("auth() hides task until authorized", () => {
		const server = createTestServer();
		server.task("deploy", auth(), { description: "Deploy" }, async () =>
			text("done"),
		);

		expect(server._isTaskVisible("deploy", "s1")).toBe(false);

		const session = server._createSessionAPI("s1");
		session.authorize("auth");

		expect(server._isTaskVisible("deploy", "s1")).toBe(true);
	});

	it("global middleware applies to tasks", () => {
		const server = createTestServer();
		server.use(auth());
		server.task("deploy", { description: "Deploy" }, async () =>
			text("done"),
		);

		expect(server._isTaskVisible("deploy", "s1")).toBe(false);

		const session = server._createSessionAPI("s1");
		session.authorize("auth");

		expect(server._isTaskVisible("deploy", "s1")).toBe(true);
	});

	it("disableTools hides task, enableTools reveals it", () => {
		const server = createTestServer();
		server.task("deploy", { description: "Deploy" }, async () =>
			text("done"),
		);

		const session = server._createSessionAPI("s1");
		expect(server._isTaskVisible("deploy", "s1")).toBe(true);

		session.disableTools("deploy");
		expect(server._isTaskVisible("deploy", "s1")).toBe(false);

		session.enableTools("deploy");
		expect(server._isTaskVisible("deploy", "s1")).toBe(true);
	});
});

describe("task in tools/list", () => {
	it("appears with execution.taskSupport = required", async () => {
		const server = createTestServer();
		server.task(
			"deploy",
			{ description: "Deploy", input: z.object({ branch: z.string() }) },
			async () => text("done"),
		);

		// Need raw client to inspect execution field on tool listing
		const { Client } = await import(
			"@modelcontextprotocol/sdk/client/index.js"
		);
		const { InMemoryTransport } = await import(
			"@modelcontextprotocol/sdk/inMemory.js"
		);
		const [ct, st] = InMemoryTransport.createLinkedPair();
		const client = new Client(
			{ name: "test-client", version: "1.0.0" },
			{ capabilities: { tasks: {} } },
		);
		await Promise.all([server._server.connect(st), client.connect(ct)]);

		const result = await client.listTools();
		const deployTool = result.tools.find((t: any) => t.name === "deploy");
		expect(deployTool).toBeDefined();
		expect(deployTool.description).toBe("Deploy");
		expect(deployTool.execution?.taskSupport).toBe("required");

		await client.close();
	});

	it("hidden task does not appear in tools/list", async () => {
		const server = createTestServer();
		server.task("deploy", auth(), { description: "Deploy" }, async () =>
			text("done"),
		);

		const t = await createTestClient(server);
		const tools = await t.listTools();
		expect(tools).not.toContain("deploy");
		await t.close();
	});

	it("coexists with regular tools", async () => {
		const server = createTestServer();
		server.tool("greet", { description: "Greet" }, async () =>
			text("hi"),
		);
		server.task("deploy", { description: "Deploy" }, async () =>
			text("done"),
		);

		const t = await createTestClient(server);
		const tools = await t.listTools();

		expect(tools).toContain("greet");
		expect(tools).toContain("deploy");
		expect(tools).toHaveLength(2);

		await t.close();
	});
});

describe("task argument validation", () => {
	it("throws if handler is missing", () => {
		const server = createTestServer();
		expect(() => server.task("deploy", { description: "Deploy" })).toThrow(
			"handler function",
		);
	});

	it("throws if config is missing", () => {
		const server = createTestServer();
		expect(() =>
			server.task("deploy", async () => text("done")),
		).toThrow("config object");
	});

	it("throws if middleware has no name", () => {
		const server = createTestServer();
		expect(() =>
			server.task("deploy", {} as any, { description: "Deploy" }, async () =>
				text("done"),
			),
		).toThrow('"name" property');
	});
});
