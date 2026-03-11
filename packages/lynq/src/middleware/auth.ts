import type { ToolMiddleware } from "../types.js";
import { type GuardOptions, guard } from "./guard.js";

/** @deprecated Use `GuardOptions` from `@lynq/lynq/guard` instead. */
export type AuthOptions = GuardOptions;

/** @deprecated Use `guard()` from `@lynq/lynq/guard` instead. */
export function auth(options?: GuardOptions): ToolMiddleware {
	return guard({ name: "auth", ...options });
}
