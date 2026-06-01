import type { ArgumentsCamelCase, Argv } from "yargs";
import { green, red, blue } from "picocolors";
import { logger } from "../logger";
import { clientNames, getTarget, writeConfig, type ClientConfig, type ConfigScope } from "../client-config";
import { authenticateViaBrowser, authenticateViaPrompt, validateKey } from "../auth";

const MCP_URL = "https://getkommit.ai/api/mcp";

export interface InstallArgs { client?: string; key?: string; scope?: ConfigScope; global?: boolean; local?: boolean; name?: string; }
export const command = "$0";
export const describe = "Install the Kommit MCP server";

export function builder(yargs: Argv<InstallArgs>): Argv {
  return yargs
    .option("client", { type: "string", description: "AI tool to install for", choices: clientNames })
    .option("key", { type: "string", description: "API key (skip browser auth)" })
    .option("scope", { type: "string", description: "Config scope", choices: ["user", "project"] as const })
    .option("global", { type: "boolean", description: "Legacy alias for --scope user" })
    .option("local", { type: "boolean", description: "Legacy alias for --scope project" })
    .option("name", { type: "string", description: "Server name in the config", default: "kommit" });
}

export function resolveConfigScope(argv: Pick<InstallArgs, "scope" | "global" | "local">): ConfigScope {
  if (argv.global && argv.local) throw new Error("Use only one of --global or --local.");
  if (argv.scope && (argv.global || argv.local)) throw new Error("Use either --scope or the legacy --global/--local flags.");
  if (argv.scope !== undefined && argv.scope !== "user" && argv.scope !== "project") {
    throw new Error(`Invalid --scope "${argv.scope}". Use "user" or "project".`);
  }
  if (argv.local) return "project";
  if (argv.global) return "user";
  return argv.scope ?? "user";
}

function getNpxCommand(): string {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function createMcpRemoteArgs(apiKey: string): string[] {
  return ["-y", "mcp-remote@latest", MCP_URL, "--header", `Authorization: Bearer ${apiKey}`];
}

function normalizeClientName(client: string): string {
  const normalized = client.toLowerCase();
  if (!clientNames.includes(normalized)) throw new Error(`Unknown client: ${client}`);
  return normalized;
}

export function createServerConfig(client: string, serverName: string, apiKey: string): ClientConfig {
  const clientName = normalizeClientName(client);
  if (clientName === "warp") throw new Error("warp requires manual setup through its UI. Use createWarpManualConfig.");

  const npxCmd = getNpxCommand();
  const stdioArgs = createMcpRemoteArgs(apiKey);

  if (clientName === "claude-code" || clientName === "vscode") {
    return { type: "http", url: MCP_URL, headers: { Authorization: `Bearer ${apiKey}` } };
  }
  if (clientName === "cursor") {
    return { url: MCP_URL, headers: { Authorization: `Bearer ${apiKey}` } };
  }
  if (clientName === "codex") {
    return { url: MCP_URL, http_headers: { Authorization: `Bearer ${apiKey}` } };
  }
  if (clientName === "gemini-cli") {
    return { httpUrl: MCP_URL, headers: { Authorization: `Bearer ${apiKey}` } };
  }
  if (clientName === "droid") {
    return { type: "http", url: MCP_URL, headers: { Authorization: `Bearer ${apiKey}` } };
  }
  if (clientName === "zed") {
    return { url: MCP_URL, headers: { Authorization: `Bearer ${apiKey}` } };
  }
  if (clientName === "goose") {
    return { name: serverName, cmd: npxCmd, args: stdioArgs, enabled: true, envs: {}, type: "stdio", timeout: 300 };
  }
  if (clientName === "opencode") {
    return { type: "remote", url: MCP_URL, enabled: true, headers: { Authorization: `Bearer ${apiKey}` } };
  }
  return { command: npxCmd, args: stdioArgs };
}

export function createWarpManualConfig(serverName: string, apiKey: string): ClientConfig {
  return {
    [serverName]: {
      command: getNpxCommand(),
      args: createMcpRemoteArgs(apiKey),
      env: {},
      working_directory: null,
      start_on_launch: true,
    },
  };
}

export async function handler(argv: ArgumentsCamelCase<InstallArgs>) {
  logger.log(""); logger.log(blue("  Kommit — Connect your AI tools")); logger.log("");

  let client = argv.client as string | undefined;
  if (!client) {
    client = (await logger.prompt("Select a client:", { type: "select", options: clientNames.map((name) => ({ value: name, label: name })) })) as string;
  }

  let scope: ConfigScope;
  try {
    scope = resolveConfigScope(argv);
    getTarget(client, scope);
  } catch (err) { logger.error(red(err instanceof Error ? err.message : String(err))); process.exit(1); }

  const serverName = argv.name || "kommit";
  logger.info(`Installing MCP server "${serverName}" for ${client} (${scope} scope)`);

  let apiKey = typeof argv.key === "string" ? argv.key.trim() : undefined;
  if (!apiKey) {
    apiKey = (await authenticateViaBrowser()) ?? undefined;
    if (!apiKey) apiKey = await authenticateViaPrompt();
  }
  if (!apiKey) { logger.error(red("No API key provided. Aborting.")); process.exit(1); }

  logger.info("Validating API key...");
  const valid = await validateKey(apiKey);
  if (!valid) { logger.error(red("API key is invalid or the server is unreachable.")); logger.info(`Generate a key at ${blue("https://getkommit.ai/settings")}`); process.exit(1); }
  logger.success(green("Authenticated successfully"));

  if (client === "warp") {
    logger.log(""); logger.info("Warp requires manual setup through their UI."); logger.log("  Copy this config into your Warp MCP settings:\n");
    logger.log(green(JSON.stringify(createWarpManualConfig(serverName, apiKey), null, 2)));
    logger.log(""); return;
  }

  const serverConfig = createServerConfig(client, serverName, apiKey);

  try {
    const writtenPath = writeConfig(serverName, serverConfig, client, scope);
    logger.info(`Config written to: ${writtenPath}`);
  } catch (err) { logger.error(red(`Failed to write config: ${err}`)); process.exit(1); }

  logger.log(""); logger.box(green("Kommit connected! Restart your editor to start using project memory.")); logger.log("");
}
