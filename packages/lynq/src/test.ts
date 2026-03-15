import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getInternals } from "./internals.js";
import type { MCPServer, Session } from "./types.js";

export { getInternals } from "./internals.js";
export type { InternalAccess } from "./internals.js";

export interface TestClient {
	/** List visible tool names. */
	listTools(): Promise<string[]>;
	/** Call a tool and return the full result. */
	callTool(
		name: string,
		args?: Record<string, unknown>,
	): Promise<CallToolResult>;
	/** Call a tool and return the first text content. Throws if isError. */
	callToolText(name: string, args?: Record<string, unknown>): Promise<string>;
	/** List visible resource URIs (static only). */
	listResources(): Promise<string[]>;
	/** List visible resource template URIs. */
	listResourceTemplates(): Promise<string[]>;
	/** Read a resource and return its text content. */
	readResource(uri: string): Promise<string>;
	/** Authorize a middleware (enable tools/resources guarded by it). */
	authorize(middlewareName: string): void;
	/** Revoke a middleware authorization. */
	revoke(middlewareName: string): void;
	/** Direct session access for test setup. */
	session: Session;
	/** Close the test client and clean up. */
	close(): Promise<void>;
}

export async function createTestClient(server: MCPServer): Promise<TestClient> {
	const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
	const { InMemoryTransport } = await import(
		"@modelcontextprotocol/sdk/inMemory.js"
	);

	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();

	const client = new Client(
		{ name: "lynq-test", version: "1.0.0" },
		{ capabilities: { tasks: {} } },
	);

	const internal = getInternals(server);
	await Promise.all([
		internal.server.connect(serverTransport),
		client.connect(clientTransport),
	]);

	const session = internal.createSessionAPI("default");

	return {
		async listTools() {
			const result = await client.listTools();
			return result.tools.map((t: { name: string }) => t.name);
		},

		async callTool(name, args = {}) {
			return client.callTool({
				name,
				arguments: args,
			}) as Promise<CallToolResult>;
		},

		async callToolText(name, args = {}) {
			const result = (await client.callTool({
				name,
				arguments: args,
			})) as CallToolResult;
			if (result.isError) {
				const content = result.content as Array<{
					type: string;
					text?: string;
				}>;
				const text =
					content.find((c) => c.type === "text")?.text ?? "Unknown error";
				throw new Error(text);
			}
			const content = result.content as Array<{
				type: string;
				text?: string;
			}>;
			const textBlock = content.find((c) => c.type === "text");
			return textBlock?.text ?? "";
		},

		async listResources() {
			const result = await client.listResources();
			return result.resources.map((r: { uri: string }) => r.uri);
		},

		async listResourceTemplates() {
			const result = await client.listResourceTemplates();
			return result.resourceTemplates.map(
				(t: { uriTemplate: string }) => t.uriTemplate,
			);
		},

		async readResource(uri) {
			const result = await client.readResource({ uri });
			const content = result.contents[0];
			return (content as { text?: string })?.text ?? "";
		},

		authorize(middlewareName) {
			session.authorize(middlewareName);
		},

		revoke(middlewareName) {
			session.revoke(middlewareName);
		},

		session,

		async close() {
			await client.close();
		},
	};
}

export const matchers = {
	toHaveTextContent(received: CallToolResult, expected: string) {
		const content = received.content as Array<{
			type: string;
			text?: string;
		}>;
		const texts = content
			.filter((c) => c.type === "text")
			.map((c) => c.text ?? "");
		const pass = texts.some((t) => t.includes(expected));
		return {
			pass,
			message: () =>
				pass
					? `Expected result not to contain "${expected}"`
					: `Expected result to contain "${expected}", got: ${texts.join(", ")}`,
		};
	},

	toBeError(received: CallToolResult) {
		const pass = received.isError === true;
		return {
			pass,
			message: () =>
				pass
					? "Expected result not to be an error"
					: "Expected result to be an error (isError: true)",
		};
	},
};
