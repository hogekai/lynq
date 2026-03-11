import { describe, expect, it } from "vitest";
import { error, image, json, text } from "../src/response.js";

describe("response helpers", () => {
	it("text() creates a text response", () => {
		const result = text("hello");
		expect(result.content).toEqual([{ type: "text", text: "hello" }]);
		expect(result.isError).toBeUndefined();
	});

	it("json() creates a JSON text response", () => {
		const result = json({ key: "value" });
		expect(result.content).toEqual([
			{ type: "text", text: '{\n  "key": "value"\n}' },
		]);
	});

	it("error() creates an error response", () => {
		const result = error("fail");
		expect(result.content).toEqual([{ type: "text", text: "fail" }]);
		expect(result.isError).toBe(true);
	});

	it("image() creates an image response", () => {
		const result = image("base64data", "image/png");
		expect(result.content).toEqual([
			{ type: "image", data: "base64data", mimeType: "image/png" },
		]);
	});

	it("chains text blocks", () => {
		const result = text("a").text("b");
		expect(result.content).toEqual([
			{ type: "text", text: "a" },
			{ type: "text", text: "b" },
		]);
	});

	it("chains text and json", () => {
		const result = text("result:").json({ x: 1 });
		expect(result.content).toEqual([
			{ type: "text", text: "result:" },
			{ type: "text", text: '{\n  "x": 1\n}' },
		]);
	});

	it("chains text and image", () => {
		const result = text("chart:").image("base64", "image/png");
		expect(result.content).toEqual([
			{ type: "text", text: "chart:" },
			{ type: "image", data: "base64", mimeType: "image/png" },
		]);
	});

	it("chains error with text and preserves isError", () => {
		const result = error("failed").text("details: timeout");
		expect(result.content).toEqual([
			{ type: "text", text: "failed" },
			{ type: "text", text: "details: timeout" },
		]);
		expect(result.isError).toBe(true);
	});

	it("error in chain sets isError on result", () => {
		const result = text("info").error("something broke");
		expect(result.content).toEqual([
			{ type: "text", text: "info" },
			{ type: "text", text: "something broke" },
		]);
		expect(result.isError).toBe(true);
	});

	it("chains are immutable", () => {
		const a = text("first");
		const b = a.text("second");
		expect(a.content).toHaveLength(1);
		expect(b.content).toHaveLength(2);
	});
});
