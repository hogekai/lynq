import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolContext, ToolInfo, ToolMiddleware } from "../types.js";

/** Run the first middleware that doesn't short-circuit. */
export function some(...middlewares: ToolMiddleware[]): ToolMiddleware {
	const names = middlewares.map((mw) => mw.name);

	return {
		name: `some(${names.join(",")})`,

		onRegister(tool: ToolInfo) {
			for (const mw of middlewares) {
				if (mw.onRegister?.(tool) === false) return false;
			}
			return undefined;
		},

		async onCall(c: ToolContext, next: () => Promise<CallToolResult>) {
			let winner: ToolMiddleware | undefined;
			let lastResult: CallToolResult | undefined;

			for (const mw of middlewares) {
				if (!mw.onCall) {
					// No onCall means it passes — this middleware "wins"
					winner = mw;
					break;
				}

				let called = false;
				const probe = async () => {
					called = true;
					return next();
				};

				const result = await mw.onCall(c, probe);
				if (called) {
					// This middleware called next() — it passed
					winner = mw;
					return result;
				}

				// Short-circuited — try the next one
				lastResult = result;
			}

			if (winner) {
				// Winner had no onCall, so just call next directly
				return next();
			}

			// All short-circuited — return the last error
			// biome-ignore lint/style/noNonNullAssertion: guaranteed by loop — at least one middleware exists
			return lastResult!;
		},

		onResult(result: CallToolResult) {
			return result;
		},
	};
}

/** Run all middlewares. Stop if any short-circuits. */
export function every(...middlewares: ToolMiddleware[]): ToolMiddleware {
	const names = middlewares.map((mw) => mw.name);
	const resultMiddlewares = middlewares.filter((mw) => mw.onResult).reverse();

	return {
		name: `every(${names.join(",")})`,

		onRegister(tool: ToolInfo) {
			for (const mw of middlewares) {
				if (mw.onRegister?.(tool) === false) return false;
			}
			return undefined;
		},

		async onCall(c: ToolContext, next: () => Promise<CallToolResult>) {
			// Chain all onCall middlewares, then call next
			const callMiddlewares = middlewares.filter((mw) => mw.onCall);
			let index = 0;

			const chain = async (): Promise<CallToolResult> => {
				if (index >= callMiddlewares.length) {
					return next();
				}
				const mw = callMiddlewares[index++];
				// biome-ignore lint/style/noNonNullAssertion: filtered above to only include middlewares with onCall
				return mw.onCall!(c, chain);
			};

			return chain();
		},

		onResult(result: CallToolResult, c: ToolContext) {
			let current = result;
			for (const mw of resultMiddlewares) {
				// biome-ignore lint/style/noNonNullAssertion: filtered above to only include middlewares with onResult
				const out = mw.onResult!(current, c);
				if (out instanceof Promise) continue;
				current = out;
			}
			return current;
		},
	};
}

/** Run middleware only when the condition is false. */
export function except(
	condition: (c: ToolContext) => boolean,
	middleware: ToolMiddleware,
): ToolMiddleware {
	return {
		name: `except(${middleware.name})`,

		onRegister(tool: ToolInfo) {
			return middleware.onRegister?.(tool);
		},

		async onCall(c: ToolContext, next: () => Promise<CallToolResult>) {
			if (condition(c)) {
				return next();
			}
			if (middleware.onCall) {
				return middleware.onCall(c, next);
			}
			return next();
		},

		onResult(result: CallToolResult, c: ToolContext) {
			if (middleware.onResult) {
				return middleware.onResult(result, c);
			}
			return result;
		},
	};
}
