import { describe, expect, it } from "vitest";
import { buildTemplatePattern, signState, verifyState } from "../src/helpers.js";

const SECRET = "test-secret-key";

describe("buildTemplatePattern", () => {
	it("matches a single-segment variable", () => {
		const re = buildTemplatePattern("file:///{name}");
		expect(re.test("file:///main.ts")).toBe(true);
	});

	it("does not match slashes within a variable segment", () => {
		const re = buildTemplatePattern("file:///{name}");
		expect(re.test("file:///src/main.ts")).toBe(false);
	});

	it("does not match path traversal", () => {
		const re = buildTemplatePattern("/files/{path}");
		expect(re.test("/files/../../etc/passwd")).toBe(false);
	});

	it("matches multiple variables", () => {
		const re = buildTemplatePattern("db://{schema}/{table}");
		expect(re.test("db://public/users")).toBe(true);
		expect(re.test("db://public/a/b")).toBe(false);
	});
});

describe("signState / verifyState", () => {
	it("round-trips with standard UUIDs", () => {
		const sessionId = "550e8400-e29b-41d4-a716-446655440000";
		const elicitationId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
		const state = signState(sessionId, elicitationId, SECRET);
		const result = verifyState(state, SECRET);
		expect(result).toEqual({ sessionId, elicitationId });
	});

	it("handles elicitationId containing colons", () => {
		const sessionId = "abc-123";
		const elicitationId = "ns:sub:value";
		const state = signState(sessionId, elicitationId, SECRET);
		const result = verifyState(state, SECRET);
		expect(result).toEqual({ sessionId, elicitationId });
	});

	it("returns null for tampered signature", () => {
		const state = signState("sess", "elicit", SECRET);
		const tampered = `${state.slice(0, -1)}0`;
		expect(verifyState(tampered, SECRET)).toBeNull();
	});

	it("returns null for wrong secret", () => {
		const state = signState("sess", "elicit", SECRET);
		expect(verifyState(state, "wrong-secret")).toBeNull();
	});

	it("returns null for empty string", () => {
		expect(verifyState("", SECRET)).toBeNull();
	});

	it("returns null for missing colon separator", () => {
		expect(verifyState("a".repeat(70), SECRET)).toBeNull();
	});

	it("returns null for empty sessionId", () => {
		const state = signState("x", "y", SECRET);
		// Replace prefix with ":y" (empty sessionId)
		const sig = state.slice(-64);
		expect(verifyState(`:y:${sig}`, SECRET)).toBeNull();
	});

	it("returns null for empty elicitationId", () => {
		const state = signState("x", "y", SECRET);
		const sig = state.slice(-64);
		expect(verifyState(`x::${sig}`, SECRET)).toBeNull();
	});
});
