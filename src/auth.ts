import http from "node:http";
import open from "open";
import { logger } from "./logger";
import { green, red, yellow } from "picocolors";

const MCP_URL = "https://getkommit.ai/api/mcp";
const CLI_AUTH_URL = "https://getkommit.ai/cli-auth";
const EXCHANGE_URL = "https://getkommit.ai/api/cli-auth/exchange";
const TIMEOUT_MS = 60_000;

function isHeadless(): boolean {
  if (process.env.SSH_CLIENT || process.env.SSH_TTY) return true;
  if (process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return true;
  return false;
}

export async function authenticateViaBrowser(): Promise<string | null> {
  if (isHeadless()) {
    logger.warn(yellow("Headless environment detected — skipping browser auth."));
    return null;
  }

  return new Promise<string | null>((resolve) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url!, `http://127.0.0.1`);
      if (url.pathname !== "/callback") { res.writeHead(404); res.end("Not found"); return; }
      const code = url.searchParams.get("code");
      if (!code) { res.writeHead(400); res.end("Missing code"); return; }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!DOCTYPE html><html><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#09090b;color:#fafafa"><div style="text-align:center"><h1 style="font-size:1.25rem">Authenticated!</h1><p style="color:#71717a">You can close this tab.</p></div></body></html>`);

      try {
        const response = await fetch(EXCHANGE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
        const data = await response.json();
        if (data.key) { cleanup(); resolve(data.key); }
        else { logger.error(red(`Code exchange failed: ${data.error || "Unknown error"}`)); cleanup(); resolve(null); }
      } catch (err) { logger.error(red(`Code exchange request failed: ${err}`)); cleanup(); resolve(null); }
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") { resolve(null); return; }
      const port = addr.port;
      logger.info(`Opening browser for authentication...`);
      open(`${CLI_AUTH_URL}?port=${port}`).catch(() => { logger.warn(yellow("Could not open browser.")); cleanup(); resolve(null); });
    });

    const timer = setTimeout(() => { logger.warn(yellow("Browser authentication timed out.")); cleanup(); resolve(null); }, TIMEOUT_MS);
    function cleanup() { clearTimeout(timer); server.close(); }
  });
}

export async function authenticateViaPrompt(): Promise<string> {
  const key = (await logger.prompt("Paste your API key (from getkommit.ai/settings):", { type: "text" })) as string;
  return key.trim();
}

export async function validateKey(key: string): Promise<boolean> {
  try {
    const response = await fetch(MCP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "kommit-cli", version: "1.0" } } }),
    });
    if (!response.ok) return false;
    const data = await response.json();
    return !!data?.result?.serverInfo;
  } catch { return false; }
}
