export function validateHost(
	hostHeader: string | null,
	allowedHosts: string[],
): boolean {
	if (!hostHeader) return false;
	const hostname = hostHeader.replace(/:\d+$/, "");
	return allowedHosts.includes(hostname);
}

export const LOCALHOST_HOSTS = ["localhost", "127.0.0.1", "::1"];
