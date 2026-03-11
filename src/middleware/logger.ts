import type { ToolMiddleware } from "../types.js";

export interface LoggerOptions {
	/** Custom log function. Default: console.log */
	log?: (message: string) => void;
}

export function logger(options?: LoggerOptions): ToolMiddleware {
	const log = options?.log ?? console.log;

	return {
		name: "logger",
		async onCall(ctx, next) {
			const start = performance.now();
			log(`[${ctx.toolName}] called (session: ${ctx.sessionId})`);
			const result = await next();
			const ms = (performance.now() - start).toFixed(1);
			log(`[${ctx.toolName}] ${ms}ms${result.isError ? " ERROR" : ""}`);
			return result;
		},
	};
}
