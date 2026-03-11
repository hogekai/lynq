import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createMCPServer } from "../../src/core.js";
import { google, handleCallback } from "../../src/middleware/google.js";
import { text } from "../../src/response.js";

function createTestServer() {
	return createMCPServer({ name: "test", version: "1.0.0" }) as any;
}

const BASE_OPTIONS = {
	clientId: "google-client-id",
	clientSecret: "google-client-secret",
	redirectUri: "http://localhost:3000/auth/google/callback",
};

describe("google middleware", () => {
	it("hides tools on registration", () => {
		const server = createTestServer();
		server.tool(
			"drive",
			google(BASE_OPTIONS),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		expect(server._isToolVisible("drive", "s1")).toBe(false);
	});

	it("has correct default name", () => {
		const mw = google(BASE_OPTIONS);
		expect(mw.name).toBe("google");
	});

	it("uses custom name", () => {
		const mw = google({ ...BASE_OPTIONS, name: "gcp" });
		expect(mw.name).toBe("gcp");
	});

	it("shows tools after authorization", () => {
		const server = createTestServer();
		server.tool(
			"drive",
			google(BASE_OPTIONS),
			{ input: z.object({}) },
			async () => text("ok"),
		);

		const session = server._createSessionAPI("s1");
		session.authorize("google");

		expect(server._isToolVisible("drive", "s1")).toBe(true);
	});
});

describe("handleCallback (google)", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		globalThis.fetch = vi.fn();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("exchanges code for token and stores user", async () => {
		const server = createTestServer();
		const session = server._createSessionAPI("session-1");

		const completeSpy = vi.spyOn(server, "completeElicitation");

		(globalThis.fetch as any)
			.mockResolvedValueOnce({
				json: async () => ({
					access_token: "ya29.abc123",
					id_token: "eyJhbGciOiJSUzI1NiJ9.test",
				}),
			})
			.mockResolvedValueOnce({
				json: async () => ({
					sub: "112233",
					name: "Alice",
					email: "alice@example.com",
					picture: "https://example.com/photo.jpg",
				}),
			});

		const result = await handleCallback(
			server,
			{ code: "auth-code", state: "session-1:elicit-1" },
			BASE_OPTIONS,
		);

		expect(result.success).toBe(true);
		expect(session.get("user")).toEqual({
			sub: "112233",
			name: "Alice",
			email: "alice@example.com",
			picture: "https://example.com/photo.jpg",
		});
		expect(session.get("accessToken")).toBe("ya29.abc123");
		expect(session.get("idToken")).toBe("eyJhbGciOiJSUzI1NiJ9.test");
		expect(completeSpy).toHaveBeenCalledWith("elicit-1");

		// Verify fetch calls
		const fetchCalls = (globalThis.fetch as any).mock.calls;
		expect(fetchCalls[0][0]).toBe("https://oauth2.googleapis.com/token");
		expect(fetchCalls[1][0]).toBe(
			"https://www.googleapis.com/oauth2/v2/userinfo",
		);
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

	it("returns error when token exchange fails", async () => {
		const server = createTestServer();
		server._createSessionAPI("session-1");

		(globalThis.fetch as any).mockResolvedValueOnce({
			json: async () => ({
				error: "invalid_grant",
				error_description: "Code has expired.",
			}),
		});

		const result = await handleCallback(
			server,
			{ code: "bad-code", state: "session-1:elicit-1" },
			BASE_OPTIONS,
		);

		expect(result.success).toBe(false);
		expect(result.error).toBe("Code has expired.");
	});

	it("does not store idToken when absent", async () => {
		const server = createTestServer();
		const session = server._createSessionAPI("session-1");

		(globalThis.fetch as any)
			.mockResolvedValueOnce({
				json: async () => ({
					access_token: "ya29.abc123",
				}),
			})
			.mockResolvedValueOnce({
				json: async () => ({
					sub: "112233",
					name: "Alice",
				}),
			});

		await handleCallback(
			server,
			{ code: "auth-code", state: "session-1:elicit-1" },
			BASE_OPTIONS,
		);

		expect(session.get("idToken")).toBeUndefined();
	});

	it("returns error on fetch failure", async () => {
		const server = createTestServer();
		server._createSessionAPI("session-1");

		(globalThis.fetch as any).mockRejectedValueOnce(new Error("Network error"));

		const result = await handleCallback(
			server,
			{ code: "code", state: "session-1:elicit-1" },
			BASE_OPTIONS,
		);

		expect(result.success).toBe(false);
		expect(result.error).toBe("Network error");
	});
});
