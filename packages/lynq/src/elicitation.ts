import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { ElicitationTracker } from "./internal-types.js";

interface PendingElicitation {
	resolver: () => void;
	completionNotifier: (() => Promise<void>) | undefined;
	createdAt: number;
}

const ELICITATION_TTL_MS = 3_600_000; // 1 hour

export function createElicitationTracker(): ElicitationTracker {
	const pendingElicitations = new Map<string, PendingElicitation>();

	function cleanupExpired(): void {
		const now = Date.now();
		for (const [id, e] of pendingElicitations) {
			if (now - e.createdAt > ELICITATION_TTL_MS) {
				pendingElicitations.delete(id);
			}
		}
	}

	function register(
		elicitationId: string,
		_sessionId: string,
		sdkServer: Server,
	): Promise<void> {
		cleanupExpired();
		return new Promise<void>((resolve) => {
			let completionNotifier: (() => Promise<void>) | undefined;
			try {
				completionNotifier =
					sdkServer.createElicitationCompletionNotifier(elicitationId);
			} catch {
				// Client may not support URL elicitation notifications
			}
			pendingElicitations.set(elicitationId, {
				resolver: resolve,
				completionNotifier,
				createdAt: Date.now(),
			});
		});
	}

	function complete(elicitationId: string): void {
		cleanupExpired();
		const pending = pendingElicitations.get(elicitationId);
		if (!pending) return;
		pendingElicitations.delete(elicitationId);
		if (pending.completionNotifier) {
			pending.completionNotifier().catch(() => {});
		}
		pending.resolver();
	}

	function cancel(elicitationId: string): void {
		const pending = pendingElicitations.get(elicitationId);
		if (!pending) return;
		pendingElicitations.delete(elicitationId);
		pending.resolver();
	}

	return { register, complete, cancel };
}
