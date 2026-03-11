import type { MCPServer, ToolMiddleware } from "../types.js";
import { oauth } from "./oauth.js";

export interface GoogleOAuthOptions {
	/** Middleware name. Default: "google-oauth" */
	name?: string;
	/** Google OAuth client ID. */
	clientId: string;
	/** Google OAuth client secret. */
	clientSecret: string;
	/** OAuth callback URL (your server's callback endpoint). */
	redirectUri: string;
	/** OAuth scopes. Default: ["openid", "profile", "email"] */
	scopes?: string[];
	/** Session key for user data. Default: "user" */
	sessionKey?: string;
	/** Message shown to the user. Default: "Please sign in with Google to continue." */
	message?: string;
	/** Timeout in ms. Default: 300000 */
	timeout?: number;
}

export function googleOAuth(options: GoogleOAuthOptions): ToolMiddleware {
	const scopes = options.scopes ?? ["openid", "profile", "email"];

	const opts: Parameters<typeof oauth>[0] = {
		name: options.name ?? "google-oauth",
		sessionKey: options.sessionKey ?? "user",
		message: options.message ?? "Please sign in with Google to continue.",
		buildUrl({ sessionId, elicitationId }) {
			const params = new URLSearchParams({
				client_id: options.clientId,
				redirect_uri: options.redirectUri,
				response_type: "code",
				scope: scopes.join(" "),
				state: `${sessionId}:${elicitationId}`,
				access_type: "offline",
			});
			return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
		},
	};
	if (options.timeout !== undefined) opts.timeout = options.timeout;
	return oauth(opts);
}

export interface HandleGoogleCallbackOptions {
	clientId: string;
	clientSecret: string;
	redirectUri: string;
	/** Session key for user data. Default: "user" */
	sessionKey?: string;
}

/**
 * Handle Google OAuth callback. Call from your HTTP callback route.
 * Exchanges code for tokens, fetches user info, stores in session, and completes elicitation.
 */
export async function handleGoogleCallback(
	server: MCPServer,
	params: { code: string; state: string },
	options: HandleGoogleCallbackOptions,
): Promise<{ success: boolean; error?: string }> {
	const sessionKey = options.sessionKey ?? "user";
	const [sessionId, elicitationId] = params.state.split(":");

	if (!sessionId || !elicitationId) {
		return { success: false, error: "Invalid state parameter" };
	}

	try {
		const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				code: params.code,
				client_id: options.clientId,
				client_secret: options.clientSecret,
				redirect_uri: options.redirectUri,
				grant_type: "authorization_code",
			}),
		});
		const tokenData = (await tokenRes.json()) as {
			access_token?: string;
			id_token?: string;
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

		const userRes = await fetch(
			"https://www.googleapis.com/oauth2/v2/userinfo",
			{
				headers: {
					Authorization: `Bearer ${tokenData.access_token}`,
				},
			},
		);
		const user = await userRes.json();

		const session = server.session(sessionId);
		session.set(sessionKey, user);
		session.set("accessToken", tokenData.access_token);
		if (tokenData.id_token) {
			session.set("idToken", tokenData.id_token);
		}
		server.completeElicitation(elicitationId);

		return { success: true };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}
