import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface ToolResponse extends CallToolResult {
	text(value: string): ToolResponse;
	json(value: unknown): ToolResponse;
	error(message: string): ToolResponse;
	image(data: string, mimeType: string): ToolResponse;
}

function createResponse(
	content: CallToolResult["content"],
	isError?: boolean,
): ToolResponse {
	return {
		content,
		...(isError ? { isError: true } : {}),

		text(value: string) {
			return createResponse(
				[...content, { type: "text", text: value }],
				isError,
			);
		},
		json(value: unknown) {
			return createResponse(
				[...content, { type: "text", text: JSON.stringify(value, null, 2) }],
				isError,
			);
		},
		error(message: string) {
			return createResponse(
				[...content, { type: "text", text: message }],
				true,
			);
		},
		image(data: string, mimeType: string) {
			return createResponse(
				[...content, { type: "image", data, mimeType }],
				isError,
			);
		},
	};
}

/** Create a text response. Chainable. */
export function text(value: string): ToolResponse {
	return createResponse([{ type: "text", text: value }]);
}

/** Create a JSON response (serialized to text). Chainable. */
export function json(value: unknown): ToolResponse {
	return createResponse([
		{ type: "text", text: JSON.stringify(value, null, 2) },
	]);
}

/** Create an error response. Chainable. */
export function error(message: string): ToolResponse {
	return createResponse([{ type: "text", text: message }], true);
}

/** Create an image response. Chainable. */
export function image(data: string, mimeType: string): ToolResponse {
	return createResponse([{ type: "image", data, mimeType }]);
}
