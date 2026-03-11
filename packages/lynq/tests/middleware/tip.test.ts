import { describe, expect, it } from "vitest";
import { tip } from "../../src/middleware/tip.js";
import { text } from "../../src/response.js";
import type { ToolContext } from "../../src/types.js";

function fakeContext(sessionId = "sess-1"): ToolContext {
	return { sessionId } as ToolContext;
}

describe("tip middleware", () => {
	it("has correct default name", () => {
		const mw = tip({ url: () => "https://tip.me" });
		expect(mw.name).toBe("tip");
	});

	it("uses custom name", () => {
		const mw = tip({ name: "my-tip", url: () => "https://tip.me" });
		expect(mw.name).toBe("my-tip");
	});

	it("does not define onRegister or onCall", () => {
		const mw = tip({ url: () => "https://tip.me" });
		expect(mw.onRegister).toBeUndefined();
		expect(mw.onCall).toBeUndefined();
	});

	it("appends tip text to successful results", () => {
		const mw = tip({ url: (sid) => `https://tip.me/${sid}` });
		const result = text("hello");
		const out = mw.onResult!(result, fakeContext("s1")) as any;
		expect(out.content).toHaveLength(2);
		expect(out.content[0]).toEqual({ type: "text", text: "hello" });
		expect(out.content[1].text).toContain("consider leaving a tip!");
		expect(out.content[1].text).toContain("https://tip.me/s1");
	});

	it("uses custom message", () => {
		const mw = tip({ url: () => "https://tip.me", message: "Tip me!" });
		const result = text("ok");
		const out = mw.onResult!(result, fakeContext());
		const tipContent = (out as any).content[1];
		expect(tipContent.text).toContain("Tip me!");
	});

	it("skips error results", () => {
		const mw = tip({ url: () => "https://tip.me" });
		const result = {
			isError: true,
			content: [{ type: "text" as const, text: "fail" }],
		};
		const out = mw.onResult!(result, fakeContext());
		expect(out).toBe(result);
	});

	it("passes sessionId to url function", () => {
		let captured: string | undefined;
		const mw = tip({
			url: (sid) => {
				captured = sid;
				return "https://tip.me";
			},
		});
		mw.onResult!(text("ok"), fakeContext("my-session"));
		expect(captured).toBe("my-session");
	});
});
