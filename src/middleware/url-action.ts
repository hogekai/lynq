import { error } from "../response.js";
import type { ToolMiddleware } from "../types.js";

export interface UrlActionOptions {
	/** Middleware name. Default: "url-action" */
	name?: string;
	/** Session key to check/store result. Default: "user" */
	sessionKey?: string;
	/** Message shown to the user in the elicitation. */
	message: string;
	/** Build the URL. Receives sessionId and elicitationId for callback routing. */
	buildUrl: (params: { sessionId: string; elicitationId: string }) => string;
	/** Timeout in ms for waiting for external callback. Default: 300000 (5 min). */
	timeout?: number;
	/** Error message when user declines. Default: "Action cancelled." */
	declineMessage?: string;
}

export function urlAction(options: UrlActionOptions): ToolMiddleware {
	const name = options.name ?? "url-action";
	const sessionKey = options.sessionKey ?? "user";
	const timeout = options.timeout ?? 300_000;
	const declineMessage = options.declineMessage ?? "Action cancelled.";

	return {
		name,
		onRegister() {
			return false;
		},
		async onCall(c, next) {
			if (c.session.get(sessionKey)) {
				return next();
			}

			const elicitationId = crypto.randomUUID();
			const url = options.buildUrl({
				sessionId: c.sessionId,
				elicitationId,
			});

			const result = await c.elicit.url(options.message, url, {
				elicitationId,
				waitForCompletion: true,
				timeout,
			});

			if (result.action !== "accept") {
				return error(declineMessage);
			}

			if (!c.session.get(sessionKey)) {
				return error("Action was not completed.");
			}

			c.session.authorize(name);
			return next();
		},
	};
}
