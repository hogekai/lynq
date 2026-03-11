import type { z } from "zod";
import { error } from "../response.js";
import type { ToolMiddleware } from "../types.js";

export interface CredentialsOptions<T extends z.ZodObject<z.ZodRawShape>> {
	/** Middleware name. Default: "credentials" */
	name?: string;
	/** Message shown to the user. */
	message: string;
	/** Zod schema for the form fields. */
	schema: T;
	/** Verify the submitted credentials. Return user data or null. */
	verify: (fields: z.infer<T>) => Promise<unknown | null>;
	/** Session key to store verified user. Default: "user" */
	sessionKey?: string;
}

export function credentials<T extends z.ZodObject<z.ZodRawShape>>(
	options: CredentialsOptions<T>,
): ToolMiddleware {
	const name = options.name ?? "credentials";
	const sessionKey = options.sessionKey ?? "user";

	return {
		name,
		onRegister() {
			return false;
		},
		async onCall(c, next) {
			// Already authenticated
			if (c.session.get(sessionKey)) {
				return next();
			}

			// Ask user for credentials via elicit.form()
			const result = await c.elicit.form(options.message, options.schema);

			if (result.action !== "accept") {
				return error("Authentication cancelled.");
			}

			// Verify credentials
			const user = await options.verify(result.content as z.infer<T>);
			if (!user) {
				return error("Invalid credentials.");
			}

			// Store user and authorize
			c.session.set(sessionKey, user);
			c.session.authorize(name);
			return next();
		},
	};
}
