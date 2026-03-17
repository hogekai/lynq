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

export interface PageResult {
	status: number;
	html?: string;
	redirect?: string;
	json?: unknown;
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

const BASE_STYLES = `body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; color: #1a1a1a; }
    .card { text-align: center; padding: 40px; }
    .icon { font-size: 3em; margin-bottom: 12px; }
    h1 { font-size: 1.2em; margin-bottom: 8px; }
    p { color: #666; font-size: 0.9em; }`;

export function successPage(type: string): string {
	const t = escapeHtml(type);
	return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${t} Complete</title>
  <style>
    ${BASE_STYLES}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#10003;</div>
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
    ${BASE_STYLES}
    .card { max-width: 420px; }
    p { color: #dc2626; word-break: break-word; }
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
    body { font-family: system-ui, sans-serif; color: #1a1a1a; max-width: 420px; margin: 60px auto; padding: 20px; }
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
