import { describe, expect, it } from "vitest";
import { error, image, json, text } from "../src/response.js";

describe("response helpers", () => {
	it("text() creates a text response", () => {
		expect(text("hello")).toEqual({
			content: [{ type: "text", text: "hello" }],
		});
	});

	it("json() creates a JSON text response", () => {
		const result = json({ key: "value" });
		expect(result).toEqual({
			content: [{ type: "text", text: '{\n  "key": "value"\n}' }],
		});
	});

	it("error() creates an error response", () => {
		expect(error("fail")).toEqual({
			content: [{ type: "text", text: "fail" }],
			isError: true,
		});
	});

	it("image() creates an image response", () => {
		expect(image("base64data", "image/png")).toEqual({
			content: [{ type: "image", data: "base64data", mimeType: "image/png" }],
		});
	});
});
