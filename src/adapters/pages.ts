import type { MCPServer } from "../types.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface GitHubPagesConfig {
	clientId: string;
	clientSecret: string;
	sessionKey?: string;
}

export interface GooglePagesConfig {
	clientId: string;
	clientSecret: string;
	sessionKey?: string;
}

export interface StripePagesConfig {
	secretKey: string;
	sessionKey?: string;
}

export interface CryptoPagesConfig {
	rpcUrl?: string;
	sessionKey?: string;
}

export interface PagesConfig {
	github?: true | string | GitHubPagesConfig;
	google?: true | string | GooglePagesConfig;
	stripe?: true | string | StripePagesConfig;
	crypto?: true | string | CryptoPagesConfig;
}

// ── Utilities ──────────────────────────────────────────────────────────

export function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

// ── HTML Templates ─────────────────────────────────────────────────────

export function successPage(type: string): string {
	const t = escapeHtml(type);
	return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${t} Complete</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; color: #1a1a1a; }
    .card { text-align: center; padding: 40px; }
    .check { font-size: 3em; margin-bottom: 12px; }
    h1 { font-size: 1.2em; margin-bottom: 8px; }
    p { color: #666; font-size: 0.9em; }
  </style>
</head>
<body>
  <div class="card">
    <div class="check">&#10003;</div>
    <h1>${t} complete</h1>
    <p>You can close this tab and return to your app.</p>
  </div>
</body>
</html>`;
}

export function errorPage(message: string): string {
	const m = escapeHtml(message);
	return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Error</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; color: #1a1a1a; }
    .card { text-align: center; padding: 40px; max-width: 420px; }
    .icon { font-size: 3em; margin-bottom: 12px; }
    h1 { font-size: 1.2em; margin-bottom: 8px; }
    p { color: #dc2626; font-size: 0.9em; word-break: break-word; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#10007;</div>
    <h1>Something went wrong</h1>
    <p>${m}</p>
  </div>
</body>
</html>`;
}

export function cryptoPaymentPage(params: {
	recipient: string;
	amount: string;
	token: string;
	network: string;
	state: string;
	callbackUrl: string;
}): string {
	const r = escapeHtml(params.recipient);
	const a = escapeHtml(params.amount);
	const t = escapeHtml(params.token);
	const n = escapeHtml(params.network);
	const s = escapeHtml(params.state);
	const cb = escapeHtml(params.callbackUrl);
	return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Payment &mdash; ${a} ${t}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; max-width: 420px; margin: 60px auto; padding: 20px; color: #1a1a1a; }
    h1 { font-size: 1.4em; margin-bottom: 8px; }
    .info { background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0; font-size: 0.9em; }
    .info dt { color: #666; font-size: 0.85em; margin-top: 8px; }
    .info dd { font-family: monospace; word-break: break-all; }
    button { width: 100%; padding: 14px; font-size: 1em; border: none; border-radius: 8px; cursor: pointer; margin-top: 12px; }
    .btn-primary { background: #2563eb; color: white; }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-primary:disabled { background: #93c5fd; cursor: not-allowed; }
    .status { text-align: center; margin-top: 16px; font-size: 0.9em; color: #666; }
    .success { color: #16a34a; }
    .error { color: #dc2626; }
  </style>
</head>
<body>
  <h1>Send ${a} ${t}</h1>
  <dl class="info">
    <dt>To</dt>
    <dd>${r}</dd>
    <dt>Network</dt>
    <dd>${n}</dd>
    <dt>Amount</dt>
    <dd>${a} ${t}</dd>
  </dl>

  <div id="data"
    data-recipient="${r}"
    data-amount="${a}"
    data-token="${t}"
    data-state="${s}"
    data-callback="${cb}"
  ></div>

  <button class="btn-primary" id="connectBtn">Connect Wallet</button>
  <button class="btn-primary" id="payBtn" style="display:none">Send ${a} ${t}</button>
  <p class="status" id="status"></p>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/ethers/6.13.4/ethers.umd.min.js"></script>
  <script>
    (function() {
      var d = document.getElementById("data").dataset;
      var RECIPIENT = d.recipient;
      var AMOUNT = d.amount;
      var TOKEN = d.token;
      var STATE = d.state;
      var CALLBACK = d.callback;
      var provider, signer;
      var statusEl = document.getElementById("status");
      var connectBtn = document.getElementById("connectBtn");
      var payBtn = document.getElementById("payBtn");

      connectBtn.addEventListener("click", async function() {
        try {
          if (!window.ethereum) {
            statusEl.textContent = "No wallet detected. Install MetaMask.";
            statusEl.className = "status error";
            return;
          }
          provider = new ethers.BrowserProvider(window.ethereum);
          signer = await provider.getSigner();
          var addr = await signer.getAddress();
          statusEl.textContent = "Connected: " + addr.slice(0, 6) + "..." + addr.slice(-4);
          statusEl.className = "status";
          connectBtn.style.display = "none";
          payBtn.style.display = "block";
        } catch (e) {
          statusEl.textContent = "Connection failed: " + e.message;
          statusEl.className = "status error";
        }
      });

      payBtn.addEventListener("click", async function() {
        payBtn.disabled = true;
        statusEl.textContent = "Sending...";
        statusEl.className = "status";

        try {
          if (TOKEN !== "ETH") {
            statusEl.textContent = "ERC-20 transfers require a contract address. Use ETH for native transfers.";
            statusEl.className = "status error";
            payBtn.disabled = false;
            return;
          }

          var tx = await signer.sendTransaction({
            to: RECIPIENT,
            value: ethers.parseEther(AMOUNT),
          });

          statusEl.textContent = "Waiting for confirmation...";
          var receipt = await tx.wait();

          var res = await fetch(CALLBACK, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              txHash: receipt.hash,
              state: STATE,
              recipient: RECIPIENT,
              amount: AMOUNT,
            }),
          });
          var data = await res.json();

          if (data.success) {
            statusEl.textContent = "Payment confirmed! You can close this tab.";
            statusEl.className = "status success";
          } else {
            statusEl.textContent = "Verification failed: " + (data.error || "unknown");
            statusEl.className = "status error";
            payBtn.disabled = false;
          }
        } catch (e) {
          statusEl.textContent = "Transaction failed: " + e.message;
          statusEl.className = "status error";
          payBtn.disabled = false;
        }
      });
    })();
  </script>
</body>
</html>`;
}

// ── Framework-agnostic Handlers ────────────────────────────────────────

export interface PageResult {
	status: number;
	html?: string;
	redirect?: string;
	json?: unknown;
}

export async function handleGitHubPage(
	server: MCPServer,
	query: { code: string | undefined; state: string | undefined },
	config: true | GitHubPagesConfig,
	prefix: string,
): Promise<PageResult> {
	if (config === true) {
		return {
			status: 500,
			html: errorPage(
				"GitHub pages require { clientId, clientSecret } configuration",
			),
		};
	}

	if (!query.code || !query.state) {
		return {
			status: 400,
			html: errorPage("Missing code or state parameter"),
		};
	}

	try {
		const { handleCallback } = await import("../middleware/github.js");
		const opts: Parameters<typeof handleCallback>[2] = {
			clientId: config.clientId,
			clientSecret: config.clientSecret,
		};
		if (config.sessionKey) opts.sessionKey = config.sessionKey;
		const result = await handleCallback(
			server,
			{ code: query.code, state: query.state },
			opts,
		);

		if (!result.success) {
			return {
				status: 500,
				html: errorPage(result.error ?? "Authentication failed"),
			};
		}

		return { status: 302, redirect: `${prefix}/auth/success` };
	} catch (err) {
		return {
			status: 500,
			html: errorPage(err instanceof Error ? err.message : String(err)),
		};
	}
}

export async function handleGooglePage(
	server: MCPServer,
	query: { code: string | undefined; state: string | undefined },
	config: true | GooglePagesConfig,
	prefix: string,
	redirectUri: string,
): Promise<PageResult> {
	if (config === true) {
		return {
			status: 500,
			html: errorPage(
				"Google pages require { clientId, clientSecret } configuration",
			),
		};
	}

	if (!query.code || !query.state) {
		return {
			status: 400,
			html: errorPage("Missing code or state parameter"),
		};
	}

	try {
		const { handleCallback } = await import("../middleware/google.js");
		const opts: Parameters<typeof handleCallback>[2] = {
			clientId: config.clientId,
			clientSecret: config.clientSecret,
			redirectUri,
		};
		if (config.sessionKey) opts.sessionKey = config.sessionKey;
		const result = await handleCallback(
			server,
			{ code: query.code, state: query.state },
			opts,
		);

		if (!result.success) {
			return {
				status: 500,
				html: errorPage(result.error ?? "Authentication failed"),
			};
		}

		return { status: 302, redirect: `${prefix}/auth/success` };
	} catch (err) {
		return {
			status: 500,
			html: errorPage(err instanceof Error ? err.message : String(err)),
		};
	}
}

export async function handleStripePage(
	server: MCPServer,
	query: {
		session_id: string | undefined;
		cancelled: string | undefined;
		state: string | undefined;
	},
	config: true | StripePagesConfig,
	prefix: string,
): Promise<PageResult> {
	if (config === true) {
		return {
			status: 500,
			html: errorPage("Stripe pages require { secretKey } configuration"),
		};
	}

	if (query.cancelled === "true") {
		return { status: 200, html: errorPage("Payment was cancelled") };
	}

	if (!query.session_id || !query.state) {
		return {
			status: 400,
			html: errorPage("Missing session_id or state parameter"),
		};
	}

	try {
		const { handleCallback } = await import("../middleware/stripe.js");
		const opts: Parameters<typeof handleCallback>[2] = {
			secretKey: config.secretKey,
		};
		if (config.sessionKey) opts.sessionKey = config.sessionKey;
		const result = await handleCallback(
			server,
			{
				checkoutSessionId: query.session_id,
				state: query.state,
			},
			opts,
		);

		if (!result.success) {
			return {
				status: 500,
				html: errorPage(result.error ?? "Payment verification failed"),
			};
		}

		return { status: 302, redirect: `${prefix}/payment/success` };
	} catch (err) {
		return {
			status: 500,
			html: errorPage(err instanceof Error ? err.message : String(err)),
		};
	}
}

export function handleCryptoGet(
	query: {
		recipient: string | undefined;
		amount: string | undefined;
		token: string | undefined;
		network: string | undefined;
		state: string | undefined;
	},
	callbackUrl: string,
): PageResult {
	if (!query.recipient || !query.amount || !query.state) {
		return {
			status: 400,
			html: errorPage("Missing required payment parameters"),
		};
	}

	return {
		status: 200,
		html: cryptoPaymentPage({
			recipient: query.recipient,
			amount: query.amount,
			token: query.token ?? "USDC",
			network: query.network ?? "base",
			state: query.state,
			callbackUrl,
		}),
	};
}

export async function handleCryptoPost(
	server: MCPServer,
	body: {
		txHash: string | undefined;
		state: string | undefined;
		recipient: string | undefined;
		amount: string | undefined;
	},
	config: true | CryptoPagesConfig,
): Promise<PageResult> {
	if (!body.txHash || !body.state || !body.recipient || !body.amount) {
		return {
			status: 400,
			json: {
				success: false,
				error: "Missing txHash, state, recipient, or amount",
			},
		};
	}

	try {
		const { handleCallback } = await import("../middleware/crypto.js");
		const opts: Parameters<typeof handleCallback>[2] = {
			recipient: body.recipient,
			amount: Number(body.amount),
		};
		if (config !== true) {
			if (config.rpcUrl) opts.rpcUrl = config.rpcUrl;
			if (config.sessionKey) opts.sessionKey = config.sessionKey;
		}
		const result = await handleCallback(
			server,
			{ txHash: body.txHash, state: body.state },
			opts,
		);

		return { status: result.success ? 200 : 500, json: result };
	} catch (err) {
		return {
			status: 500,
			json: {
				success: false,
				error: err instanceof Error ? err.message : String(err),
			},
		};
	}
}
