import { describe, expect, it } from "vitest";
import { createMCPServer } from "../src/core.js";
import { auth } from "../src/middleware/auth.js";
import { error, text } from "../src/response.js";
import { createTestClient } from "../src/test.js";
import type { ToolMiddleware } from "../src/types.js";

function createTestServer() {
	return createMCPServer({ name: "test", version: "1.0.0" }) as any;
}

describe("resource registration", () => {
	it("registers a static resource", () => {
		const server = createTestServer();
		server.resource("config://settings", { name: "Settings" }, async () => ({
			text: "{}",
		}));
		expect(server._isResourceVisible("config://settings", "default")).toBe(
			true,
		);
	});

	it("registers a template resource", () => {
		const server = createTestServer();
		server.resource("file:///{path}", { name: "Files" }, async () => ({
			text: "",
		}));
		expect(server._isResourceVisible("file:///{path}", "default")).toBe(true);
	});

	it("throws when last argument is not a function", () => {
		const server = createTestServer();
		expect(() => {
			server.resource("test://x", { name: "X" }, "not-a-function");
		}).toThrow(
			'resource("test://x"): last argument must be a handler function',
		);
	});

	it("throws when config lacks name property", () => {
		const server = createTestServer();
		expect(() => {
			server.resource("test://x", { description: "no name" }, async () => ({
				text: "",
			}));
		}).toThrow(
			'resource("test://x"): second-to-last argument must be a config object with a "name" property',
		);
	});
});

describe("resource visibility", () => {
	it("middleware-less resources are visible by default", () => {
		const server = createTestServer();
		server.resource("data://public", { name: "Public" }, async () => ({
			text: "hi",
		}));
		expect(server._isResourceVisible("data://public", "default")).toBe(true);
	});

	it("auth() middleware hides resources initially", () => {
		const server = createTestServer();
		server.resource("data://secret", auth(), { name: "Secret" }, async () => ({
			text: "hidden",
		}));
		expect(server._isResourceVisible("data://secret", "default")).toBe(false);
	});

	it("authorize reveals resources and tools guarded by same middleware", () => {
		const server = createTestServer();
		const mw: ToolMiddleware = { name: "guard", onRegister: () => false };

		server.tool("guarded-tool", mw, { description: "t" }, async () =>
			text("ok"),
		);
		server.resource("data://guarded", mw, { name: "Guarded" }, async () => ({
			text: "ok",
		}));

		expect(server._isToolVisible("guarded-tool", "s1")).toBe(false);
		expect(server._isResourceVisible("data://guarded", "s1")).toBe(false);

		const session = server._createSessionAPI("s1");
		session.authorize("guard");

		expect(server._isToolVisible("guarded-tool", "s1")).toBe(true);
		expect(server._isResourceVisible("data://guarded", "s1")).toBe(true);
	});

	it("revoke hides both tools and resources", () => {
		const server = createTestServer();
		const mw: ToolMiddleware = { name: "auth", onRegister: () => false };

		server.tool("t", mw, { description: "t" }, async () => text("ok"));
		server.resource("data://r", mw, { name: "R" }, async () => ({
			text: "ok",
		}));

		const session = server._createSessionAPI("s1");
		session.authorize("auth");
		expect(server._isToolVisible("t", "s1")).toBe(true);
		expect(server._isResourceVisible("data://r", "s1")).toBe(true);

		session.revoke("auth");
		expect(server._isToolVisible("t", "s1")).toBe(false);
		expect(server._isResourceVisible("data://r", "s1")).toBe(false);
	});

	it("enableResources/disableResources control individual resource visibility", () => {
		const server = createTestServer();
		server.resource("data://a", { name: "A" }, async () => ({ text: "a" }));
		server.resource("data://b", { name: "B" }, async () => ({ text: "b" }));

		const session = server._createSessionAPI("s1");

		session.disableResources("data://a");
		expect(server._isResourceVisible("data://a", "s1")).toBe(false);
		expect(server._isResourceVisible("data://b", "s1")).toBe(true);

		session.enableResources("data://a");
		expect(server._isResourceVisible("data://a", "s1")).toBe(true);
	});

	it("global middleware (server.use) affects resources", () => {
		const server = createTestServer();
		const mw: ToolMiddleware = { name: "global", onRegister: () => false };

		server.use(mw);
		server.tool("tool-a", { description: "t" }, async () => text("ok"));
		server.resource("data://r", { name: "R" }, async () => ({ text: "ok" }));

		// Both tool and resource are hidden by global middleware
		expect(server._isToolVisible("tool-a", "default")).toBe(false);
		expect(server._isResourceVisible("data://r", "default")).toBe(false);

		// After granting, both become visible
		const session = server._createSessionAPI("default");
		session.authorize("global");
		expect(server._isToolVisible("tool-a", "default")).toBe(true);
		expect(server._isResourceVisible("data://r", "default")).toBe(true);
	});
});

describe("resources/list integration", () => {
	it("returns only visible static resources", async () => {
		const server = createTestServer();
		const mw: ToolMiddleware = { name: "auth", onRegister: () => false };

		server.resource(
			"data://public",
			{ name: "Public", mimeType: "text/plain" },
			async () => ({ text: "public" }),
		);
		server.resource("data://private", mw, { name: "Private" }, async () => ({
			text: "private",
		}));
		// Template should not appear in resources/list
		server.resource("file:///{path}", { name: "Files" }, async () => ({
			text: "",
		}));

		const t = await createTestClient(server);

		const uris = await t.listResources();

		expect(uris).toContain("data://public");
		expect(uris).not.toContain("data://private");
		expect(uris).not.toContain("file:///{path}");

		await t.close();
	});
});

describe("resources/templates/list integration", () => {
	it("returns only visible template resources", async () => {
		const server = createTestServer();
		const mw: ToolMiddleware = { name: "auth", onRegister: () => false };

		server.resource("file:///{path}", { name: "Files" }, async () => ({
			text: "",
		}));
		server.resource("secret:///{id}", mw, { name: "Secrets" }, async () => ({
			text: "",
		}));
		// Static should not appear in templates/list
		server.resource("config://settings", { name: "Settings" }, async () => ({
			text: "{}",
		}));

		const t = await createTestClient(server);

		const uris = await t.listResourceTemplates();

		expect(uris).toContain("file:///{path}");
		expect(uris).not.toContain("secret:///{id}");
		expect(uris).not.toContain("config://settings");

		await t.close();
	});
});

describe("resources/read integration", () => {
	it("reads a static resource", async () => {
		const server = createTestServer();
		server.resource(
			"config://settings",
			{ name: "Settings", mimeType: "application/json" },
			async () => ({ text: '{"theme":"dark"}' }),
		);

		const t = await createTestClient(server);

		const txt = await t.readResource("config://settings");
		expect(txt).toBe('{"theme":"dark"}');

		await t.close();
	});

	it("reads a template resource with matched URI", async () => {
		const server = createTestServer();
		let receivedUri = "";

		server.resource(
			"file:///{path}",
			{ name: "Files", mimeType: "text/plain" },
			async (uri) => {
				receivedUri = uri;
				return { text: `content of ${uri}` };
			},
		);

		const t = await createTestClient(server);

		const txt = await t.readResource("file:///main.ts");
		expect(txt).toBe("content of file:///main.ts");
		expect(receivedUri).toBe("file:///main.ts");

		await t.close();
	});

	it("reads a resource returning blob content", async () => {
		const server = createTestServer();
		const base64Data = Buffer.from("hello").toString("base64");

		server.resource(
			"data://binary",
			{ name: "Binary", mimeType: "application/octet-stream" },
			async () => ({ blob: base64Data }),
		);

		// Blob assertion needs raw client — readResource returns text only
		const { Client } = await import(
			"@modelcontextprotocol/sdk/client/index.js"
		);
		const { InMemoryTransport } = await import(
			"@modelcontextprotocol/sdk/inMemory.js"
		);
		const [ct, st] = InMemoryTransport.createLinkedPair();
		const client = new Client({ name: "test-client", version: "1.0.0" });
		await Promise.all([server._server.connect(st), client.connect(ct)]);

		const result = await client.readResource({ uri: "data://binary" });
		expect(result.contents[0].blob).toBe(base64Data);

		await client.close();
	});

	it("throws for unknown resource", async () => {
		const server = createTestServer();
		const t = await createTestClient(server);

		await expect(t.readResource("nonexistent://x")).rejects.toThrow();

		await t.close();
	});

	it("throws for hidden resource", async () => {
		const server = createTestServer();
		const mw: ToolMiddleware = { name: "auth", onRegister: () => false };

		server.resource("data://secret", mw, { name: "Secret" }, async () => ({
			text: "secret",
		}));

		const t = await createTestClient(server);

		await expect(t.readResource("data://secret")).rejects.toThrow();

		await t.close();
	});

	it("runs middleware onCall chain for resources", async () => {
		const server = createTestServer();
		const order: string[] = [];

		const mw: ToolMiddleware = {
			name: "logger",
			async onCall(_c, next) {
				order.push("middleware");
				return next();
			},
		};

		server.resource("data://logged", mw, { name: "Logged" }, async () => {
			order.push("handler");
			return { text: "ok" };
		});

		const t = await createTestClient(server);

		await t.readResource("data://logged");
		expect(order).toEqual(["middleware", "handler"]);

		await t.close();
	});
});
