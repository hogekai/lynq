import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** Create a text response. */
export function text(value: string): CallToolResult {
	return { content: [{ type: "text", text: value }] };
}

/** Create a JSON response (serialized to text). */
export function json(value: unknown): CallToolResult {
	return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

/** Create an error response. */
export function error(message: string): CallToolResult {
	return { content: [{ type: "text", text: message }], isError: true };
}

/** Create an image response. */
export function image(data: string, mimeType: string): CallToolResult {
	return { content: [{ type: "image", data, mimeType }] };
}
