import type { ToolMiddleware } from "../types.js";

export interface LoggerOptions {
	/** Custom log function. Default: console.log */
	log?: (message: string) => void;
}

export function logger(options?: LoggerOptions): ToolMiddleware {
	const log = options?.log ?? console.log;

	return {
		name: "logger",
		async onCall(c, next) {
			const start = performance.now();
			log(`[${c.toolName}] called (session: ${c.sessionId})`);
			const result = await next();
			const ms = (performance.now() - start).toFixed(1);
			log(`[${c.toolName}] ${ms}ms${result.isError ? " ERROR" : ""}`);
			return result;
		},
	};
}
