import { createMCPServer, text } from "@lynq/lynq";
import { signState } from "@lynq/lynq/helpers";
import { getInternals } from "@lynq/lynq/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { github, handleCallback } from "../src/index.js";

function createTestServer() {
	return createMCPServer({ name: "test", version: "1.0.0" });
}

const BASE_OPTIONS = {
	clientId: "gh-client-id",
	clientSecret: "gh-client-secret",
	redirectUri: "http://localhost:3000/auth/github/callback",
};

describe("github middleware", () => {
	it("hides tools on registration", () => {
		const server = createTestServer();
		server.tool(
			"repos",
			github(BASE_OPTIONS),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		expect(getInternals(server).isToolVisible("repos", "s1")).toBe(false);
	});

	it("has correct default name", () => {
		const mw = github(BASE_OPTIONS);
		expect(mw.name).toBe("github");
	});

	it("uses custom name", () => {
		const mw = github({ ...BASE_OPTIONS, name: "gh" });
		expect(mw.name).toBe("gh");
	});

	it("shows tools after authorization", () => {
		const server = createTestServer();
		server.tool(
			"repos",
			github(BASE_OPTIONS),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		const session = getInternals(server).createSessionAPI("s1");
		session.authorize("github");

		expect(getInternals(server).isToolVisible("repos", "s1")).toBe(true);
	});
});

describe("handleCallback (github)", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		globalThis.fetch = vi.fn();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("exchanges code for token and stores user", async () => {
		const server = createTestServer();
		const session = getInternals(server).createSessionAPI("session-1");

		// Track completeElicitation call
		const completeSpy = vi.spyOn(server, "completeElicitation");

		(globalThis.fetch as any)
			.mockResolvedValueOnce({
				json: async () => ({
					access_token: "gho_abc123",
				}),
			})
			.mockResolvedValueOnce({
				json: async () => ({
					id: 42,
					login: "alice",
					name: "Alice",
				}),
			});

		const state = signState("session-1", "elicit-1", BASE_OPTIONS.clientSecret);
		const result = await handleCallback(
			server,
			{ code: "auth-code", state },
			BASE_OPTIONS,
		);

		expect(result.success).toBe(true);
		expect(session.get("user")).toEqual({
			id: 42,
			login: "alice",
			name: "Alice",
		});
		expect(session.get("accessToken")).toBe("gho_abc123");
		expect(completeSpy).toHaveBeenCalledWith("elicit-1");

		// Verify fetch calls
		const fetchCalls = (globalThis.fetch as any).mock.calls;
		expect(fetchCalls[0][0]).toBe(
			"https://github.com/login/oauth/access_token",
		);
		expect(fetchCalls[1][0]).toBe("https://api.github.com/user");
	});

	it("returns error on invalid state", async () => {
		const server = createTestServer();

		const result = await handleCallback(
			server,
			{ code: "auth-code", state: "invalid" },
			BASE_OPTIONS,
		);

		expect(result.success).toBe(false);
		expect(result.error).toBe("Invalid state parameter");
	});

	it("returns error on tampered state", async () => {
		const server = createTestServer();

		const result = await handleCallback(
			server,
			{ code: "auth-code", state: "session-1:elicit-1:badsig" },
			BASE_OPTIONS,
		);

		expect(result.success).toBe(false);
		expect(result.error).toBe("Invalid state parameter");
	});

	it("returns error when token exchange fails", async () => {
		const server = createTestServer();
		getInternals(server).createSessionAPI("session-1");

		(globalThis.fetch as any).mockResolvedValueOnce({
			json: async () => ({
				error: "bad_verification_code",
				error_description: "The code passed is incorrect or expired.",
			}),
		});

		const state = signState("session-1", "elicit-1", BASE_OPTIONS.clientSecret);
		const result = await handleCallback(
			server,
			{ code: "bad-code", state },
			BASE_OPTIONS,
		);

		expect(result.success).toBe(false);
		expect(result.error).toBe("The code passed is incorrect or expired.");
	});

	it("returns error on fetch failure", async () => {
		const server = createTestServer();
		getInternals(server).createSessionAPI("session-1");

		(globalThis.fetch as any).mockRejectedValueOnce(new Error("Network error"));

		const state = signState("session-1", "elicit-1", BASE_OPTIONS.clientSecret);
		const result = await handleCallback(
			server,
			{ code: "code", state },
			BASE_OPTIONS,
		);

		expect(result.success).toBe(false);
		expect(result.error).toBe("Network error");
	});
});
