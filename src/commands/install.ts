import type { ArgumentsCamelCase, Argv } from "yargs";
import { green, red, blue } from "picocolors";
import { logger } from "../logger";
import { clientNames, isNativeUrlClient, writeConfig, type ClientConfig } from "../client-config";
import { authenticateViaBrowser, authenticateViaPrompt, validateKey } from "../auth";

const MCP_URL = "https://getkommit.ai/api/mcp";

export interface InstallArgs { client?: string; key?: string; global?: boolean; name?: string; }
export const command = "$0";
export const describe = "Install the Kommit MCP server";

export function builder(yargs: Argv<InstallArgs>): Argv {
  return yargs
    .option("client", { type: "string", description: "AI tool to install for", choices: clientNames })
    .option("key", { type: "string", description: "API key (skip browser auth)" })
    .option("global", { type: "boolean", description: "Write to global config instead of project-local", default: false })
    .option("name", { type: "string", description: "Server name in the config", default: "kommit" });
}

export async function handler(argv: ArgumentsCamelCase<InstallArgs>) {
  logger.log(""); logger.log(blue("  Kommit — Connect your AI tools")); logger.log("");

  let client = argv.client as string | undefined;
  if (!client) {
    client = (await logger.prompt("Select a client:", { type: "select", options: clientNames.map((name) => ({ value: name, label: name })) })) as string;
  }

  const local = !argv.global;
  const serverName = argv.name || "kommit";
  logger.info(`Installing MCP server "${serverName}" for ${client}`);

  let apiKey = argv.key as string | undefined;
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
    const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
    logger.log(""); logger.info("Warp requires manual setup through their UI."); logger.log("  Copy this config into your Warp MCP settings:\n");
    logger.log(green(JSON.stringify({ [serverName]: { command: npxCmd, args: ["-y", "mcp-remote@latest", MCP_URL, "--header", `Authorization: Bearer ${apiKey}`], env: {}, working_directory: null, start_on_launch: true } }, null, 2)));
    logger.log(""); return;
  }

  let serverConfig: ClientConfig;
  const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const stdioArgs = ["-y", "mcp-remote@latest", MCP_URL, "--header", `Authorization: Bearer ${apiKey}`];

  if (isNativeUrlClient(client)) {
    // Claude Code uses "http", Cursor/VS Code use "url"
    const transportType = client === "claude-code" ? "http" : "url";
    serverConfig = { type: transportType, url: MCP_URL, headers: { Authorization: `Bearer ${apiKey}` } };
  } else if (client === "goose") {
    serverConfig = { name: serverName, cmd: npxCmd, args: stdioArgs, enabled: true, envs: {}, type: "stdio", timeout: 300 };
  } else if (client === "zed") {
    serverConfig = { source: "custom", command: npxCmd, args: stdioArgs, env: {} };
  } else if (client === "opencode") {
    serverConfig = { type: "remote", url: MCP_URL, enabled: true, headers: { Authorization: `Bearer ${apiKey}` } };
  } else {
    serverConfig = { command: npxCmd, args: stdioArgs };
  }

  try {
    const writtenPath = writeConfig(serverName, serverConfig, client, local);
    logger.info(`Config written to: ${writtenPath}`);
  } catch (err) { logger.error(red(`Failed to write config: ${err}`)); process.exit(1); }

  logger.log(""); logger.box(green("Kommit connected! Restart your editor to start using project memory.")); logger.log("");
}
