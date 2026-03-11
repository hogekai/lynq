import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../src/core.js";
import { text } from "../src/response.js";
import { createUserStore, memoryStore, resolveUserId } from "../src/store.js";
import type { Session } from "../src/types.js";

function mockSession(data: Record<string, unknown> = {}): Session {
	const map = new Map(Object.entries(data));
	return {
		get: <T = unknown>(key: string) => map.get(key) as T | undefined,
		set: (key: string, value: unknown) => map.set(key, value),
		authorize: () => {},
		revoke: () => {},
		enableTools: () => {},
		disableTools: () => {},
		enableResources: () => {},
		disableResources: () => {},
	};
}

describe("memoryStore", () => {
	it("returns undefined for missing key", async () => {
		const store = memoryStore();
		expect(await store.get("missing")).toBeUndefined();
	});

	it("gets and sets values", async () => {
		const store = memoryStore();
		await store.set("key", { foo: "bar" });
		expect(await store.get("key")).toEqual({ foo: "bar" });
	});

	it("deletes values", async () => {
		const store = memoryStore();
		await store.set("key", "value");
		await store.delete("key");
		expect(await store.get("key")).toBeUndefined();
	});

	it("overwrites existing values", async () => {
		const store = memoryStore();
		await store.set("key", "old");
		await store.set("key", "new");
		expect(await store.get("key")).toBe("new");
	});

	it("returns undefined for expired TTL", async () => {
		vi.useFakeTimers();
		try {
			const store = memoryStore();
			await store.set("key", "value", 1); // 1 second TTL
			vi.advanceTimersByTime(1001);
			expect(await store.get("key")).toBeUndefined();
		} finally {
			vi.useRealTimers();
		}
	});

	it("returns value before TTL expires", async () => {
		vi.useFakeTimers();
		try {
			const store = memoryStore();
			await store.set("key", "value", 10); // 10 second TTL
			vi.advanceTimersByTime(5000);
			expect(await store.get("key")).toBe("value");
		} finally {
			vi.useRealTimers();
		}
	});

	it("persists without TTL", async () => {
		const store = memoryStore();
		await store.set("key", "value");
		expect(await store.get("key")).toBe("value");
	});
});

describe("resolveUserId", () => {
	it("returns undefined when no user in session", () => {
		expect(resolveUserId(mockSession())).toBeUndefined();
	});

	it("resolves string user", () => {
		expect(resolveUserId(mockSession({ user: "alice" }))).toBe("alice");
	});

	it("resolves { id: string } user", () => {
		expect(resolveUserId(mockSession({ user: { id: "u-1" } }))).toBe("u-1");
	});

	it("resolves { id: number } user", () => {
		expect(resolveUserId(mockSession({ user: { id: 42 } }))).toBe("42");
	});

	it("resolves { sub: string } user (JWT-style)", () => {
		expect(resolveUserId(mockSession({ user: { sub: "sub-1" } }))).toBe(
			"sub-1",
		);
	});

	it("returns undefined for unrecognized user shape", () => {
		expect(
			resolveUserId(mockSession({ user: { name: "alice" } })),
		).toBeUndefined();
	});
});

describe("createUserStore", () => {
	it("prefixes keys with user ID", async () => {
		const store = memoryStore();
		const session = mockSession({ user: "alice" });
		const userStore = createUserStore(session, store);

		await userStore.set("prefs", { theme: "dark" });
		expect(await store.get("user:alice:prefs")).toEqual({ theme: "dark" });
		expect(await userStore.get("prefs")).toEqual({ theme: "dark" });
	});

	it("deletes with prefixed key", async () => {
		const store = memoryStore();
		const session = mockSession({ user: "alice" });
		const userStore = createUserStore(session, store);

		await userStore.set("prefs", "val");
		await userStore.delete("prefs");
		expect(await store.get("user:alice:prefs")).toBeUndefined();
	});

	it("throws when no user in session", async () => {
		const store = memoryStore();
		const session = mockSession();
		const userStore = createUserStore(session, store);

		await expect(userStore.get("key")).rejects.toThrow(
			"userStore requires a user in session",
		);
		await expect(userStore.set("key", "val")).rejects.toThrow(
			"userStore requires a user in session",
		);
		await expect(userStore.delete("key")).rejects.toThrow(
			"userStore requires a user in session",
		);
	});

	it("passes TTL through", async () => {
		vi.useFakeTimers();
		try {
			const store = memoryStore();
			const session = mockSession({ user: "bob" });
			const userStore = createUserStore(session, store);

			await userStore.set("token", "abc", 1);
			vi.advanceTimersByTime(1001);
			expect(await userStore.get("token")).toBeUndefined();
		} finally {
			vi.useRealTimers();
		}
	});

	it("isolates different users", async () => {
		const store = memoryStore();
		const sessionAlice = mockSession({ user: "alice" });
		const sessionBob = mockSession({ user: "bob" });

		const aliceStore = createUserStore(sessionAlice, store);
		const bobStore = createUserStore(sessionBob, store);

		await aliceStore.set("prefs", "alice-prefs");
		await bobStore.set("prefs", "bob-prefs");

		expect(await aliceStore.get("prefs")).toBe("alice-prefs");
		expect(await bobStore.get("prefs")).toBe("bob-prefs");
	});
});

describe("store in context (integration)", () => {
	it("c.store is available in tool handler", async () => {
		const store = memoryStore();
		await store.set("config", { feature: true });

		const server = createMCPServer({
			name: "test",
			version: "1.0.0",
			store,
		}) as any;

		let captured: unknown;
		server.tool(
			"read-config",
			{ input: z.object({}) },
			async (_args: any, c: any) => {
				captured = await c.store.get("config");
				return text("ok");
			},
		);

		const { Client } = await import(
			"@modelcontextprotocol/sdk/client/index.js"
		);
		const { InMemoryTransport } = await import(
			"@modelcontextprotocol/sdk/inMemory.js"
		);
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		const client = new Client({ name: "test-client", version: "1.0.0" });
		await Promise.all([
			server._server.connect(serverTransport),
			client.connect(clientTransport),
		]);

		await client.callTool({ name: "read-config", arguments: {} });
		expect(captured).toEqual({ feature: true });
	});

	it("c.userStore is available in tool handler", async () => {
		const store = memoryStore();
		const server = createMCPServer({
			name: "test",
			version: "1.0.0",
			store,
		}) as any;

		let captured: unknown;
		server.tool(
			"user-prefs",
			{ input: z.object({}) },
			async (_args: any, c: any) => {
				await c.userStore.set("prefs", { theme: "dark" });
				captured = await c.userStore.get("prefs");
				return text("ok");
			},
		);

		// Set user in session before calling
		server._createSessionAPI("default").set("user", "alice");

		const { Client } = await import(
			"@modelcontextprotocol/sdk/client/index.js"
		);
		const { InMemoryTransport } = await import(
			"@modelcontextprotocol/sdk/inMemory.js"
		);
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		const client = new Client({ name: "test-client", version: "1.0.0" });
		await Promise.all([
			server._server.connect(serverTransport),
			client.connect(clientTransport),
		]);

		await client.callTool({ name: "user-prefs", arguments: {} });
		expect(captured).toEqual({ theme: "dark" });
		// Verify it was stored with user prefix
		expect(await store.get("user:alice:prefs")).toEqual({ theme: "dark" });
	});

	it("server.store exposes the store instance", () => {
		const store = memoryStore();
		const server = createMCPServer({
			name: "test",
			version: "1.0.0",
			store,
		});
		expect(server.store).toBe(store);
	});

	it("defaults to memoryStore when no store provided", () => {
		const server = createMCPServer({ name: "test", version: "1.0.0" });
		expect(server.store).toBeDefined();
		expect(server.store.get).toBeTypeOf("function");
		expect(server.store.set).toBeTypeOf("function");
		expect(server.store.delete).toBeTypeOf("function");
	});
});
