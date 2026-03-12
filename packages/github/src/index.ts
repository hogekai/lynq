import type { MCPServer, ToolContext, ToolMiddleware } from "@lynq/lynq";
import { signState, verifyState } from "@lynq/lynq/helpers";
import { oauth } from "@lynq/lynq/oauth";

export interface GitHubOptions {
	/** Middleware name. Default: "github" */
	name?: string;
	/** GitHub OAuth App client ID. */
	clientId: string;
	/** GitHub OAuth App client secret. */
	clientSecret: string;
	/** OAuth callback URL (your server's callback endpoint). */
	redirectUri: string;
	/** GitHub OAuth scopes. Default: [] */
	scopes?: string[];
	/** Session key for user data. Default: "user" */
	sessionKey?: string;
	/** Message shown to the user. Default: "Please sign in with GitHub to continue." */
	message?: string;
	/** Timeout in ms. Default: 300000 */
	timeout?: number;
	/** Custom skip condition. Takes priority over sessionKey check. */
	skipIf?: (c: ToolContext) => boolean | Promise<boolean>;
	/** Called after authentication completes successfully, before next(). */
	onComplete?: (c: ToolContext) => void | Promise<void>;
}

/** @deprecated Use `GitHubOptions` instead. */
export type GitHubOAuthOptions = GitHubOptions;

export function github(options: GitHubOptions): ToolMiddleware {
	const scopes = options.scopes ?? [];

	const opts: Parameters<typeof oauth>[0] = {
		name: options.name ?? "github",
		sessionKey: options.sessionKey ?? "user",
		message: options.message ?? "Please sign in with GitHub to continue.",
		buildUrl({ sessionId, elicitationId }) {
			const params = new URLSearchParams({
				client_id: options.clientId,
				redirect_uri: options.redirectUri,
				state: signState(sessionId, elicitationId, options.clientSecret),
			});
			if (scopes.length > 0) params.set("scope", scopes.join(" "));
			return `https://github.com/login/oauth/authorize?${params}`;
		},
	};
	if (options.timeout !== undefined) opts.timeout = options.timeout;
	if (options.skipIf) opts.skipIf = options.skipIf;
	if (options.onComplete) opts.onComplete = options.onComplete;
	return oauth(opts);
}

/** @deprecated Use `github()` from `@lynq/github` instead. */
export const githubOAuth = github;

export interface HandleCallbackOptions {
	clientId: string;
	clientSecret: string;
	/** Session key for user data. Default: "user" */
	sessionKey?: string;
}

/** @deprecated Use `HandleCallbackOptions` instead. */
export type HandleGitHubCallbackOptions = HandleCallbackOptions;

/**
 * Handle GitHub OAuth callback. Call from your HTTP callback route.
 * Exchanges code for token, fetches user info, stores in session, and completes elicitation.
 */
export async function handleCallback(
	server: MCPServer,
	params: { code: string; state: string },
	options: HandleCallbackOptions,
): Promise<{ success: boolean; error?: string }> {
	const sessionKey = options.sessionKey ?? "user";
	const verified = verifyState(params.state, options.clientSecret);

	if (!verified) {
		return { success: false, error: "Invalid state parameter" };
	}

	const { sessionId, elicitationId } = verified;

	try {
		const tokenRes = await fetch(
			"https://github.com/login/oauth/access_token",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
				},
				body: JSON.stringify({
					client_id: options.clientId,
					client_secret: options.clientSecret,
					code: params.code,
				}),
			},
		);
		const tokenData = (await tokenRes.json()) as {
			access_token?: string;
			error?: string;
			error_description?: string;
		};

		if (!tokenData.access_token) {
			return {
				success: false,
				error:
					tokenData.error_description ??
					tokenData.error ??
					"Token exchange failed",
			};
		}

		const userRes = await fetch("https://api.github.com/user", {
			headers: { Authorization: `Bearer ${tokenData.access_token}` },
		});
		const user = await userRes.json();

		const session = server.session(sessionId);
		session.set(sessionKey, user);
		session.set("accessToken", tokenData.access_token);
		server.completeElicitation(elicitationId);

		return { success: true };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/** @deprecated Use `handleCallback()` from `@lynq/github` instead. */
export const handleGitHubCallback = handleCallback;
