import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import * as TOML from "@iarna/toml";
import yaml from "js-yaml";
import * as jsonc from "jsonc-parser";

import { logger } from "./logger";

// biome-ignore lint/suspicious/noExplicitAny: flexible config structure
export type ClientConfig = Record<string, any>;

interface ClientTarget {
  path: string;
  localPath?: string;
  configKey: string;
  format?: "json" | "yaml" | "toml";
  nativeUrl?: boolean;
}

function getPlatformPaths() {
  const homeDir = os.homedir();
  const platform = process.platform;
  if (platform === "win32") {
    const base = process.env.APPDATA || path.join(homeDir, "AppData", "Roaming");
    return { baseDir: base, vscodePath: path.join("Code", "User") };
  }
  if (platform === "darwin") {
    return { baseDir: path.join(homeDir, "Library", "Application Support"), vscodePath: path.join("Code", "User") };
  }
  const base = process.env.XDG_CONFIG_HOME || path.join(homeDir, ".config");
  return { baseDir: base, vscodePath: path.join("Code", "User") };
}

function getClientTargets(): Record<string, ClientTarget> {
  const { baseDir, vscodePath } = getPlatformPaths();
  const homeDir = os.homedir();
  return {
    "claude-code": { path: path.join(homeDir, ".claude.json"), localPath: path.join(process.cwd(), ".mcp.json"), configKey: "mcpServers", nativeUrl: true },
    cursor: { path: path.join(homeDir, ".cursor", "mcp.json"), localPath: path.join(process.cwd(), ".cursor", "mcp.json"), configKey: "mcpServers", nativeUrl: true },
    vscode: { path: path.join(baseDir, vscodePath, "mcp.json"), localPath: path.join(process.cwd(), ".vscode", "mcp.json"), configKey: "mcpServers", nativeUrl: true },
    "claude-desktop": { path: path.join(baseDir, "Claude", "claude_desktop_config.json"), configKey: "mcpServers" },
    windsurf: { path: path.join(homeDir, ".codeium", "windsurf", "mcp_config.json"), configKey: "mcpServers" },
    cline: { path: path.join(baseDir, vscodePath, "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"), configKey: "mcpServers" },
    "roo-cline": { path: path.join(baseDir, vscodePath, "globalStorage", "rooveterinaryinc.roo-cline", "settings", "mcp_settings.json"), configKey: "mcpServers" },
    "gemini-cli": { path: path.join(homeDir, ".gemini", "settings.json"), localPath: path.join(process.cwd(), ".gemini", "settings.json"), configKey: "mcpServers" },
    goose: { path: path.join(homeDir, ".config", "goose", "config.yaml"), configKey: "extensions", format: "yaml" },
    zed: { path: process.platform === "win32" ? path.join(process.env.APPDATA || path.join(homeDir, "AppData", "Roaming"), "Zed", "settings.json") : path.join(homeDir, ".config", "zed", "settings.json"), configKey: "context_servers" },
    codex: { path: path.join(process.env.CODEX_HOME || path.join(homeDir, ".codex"), "config.toml"), configKey: "mcp_servers", format: "toml" },
    aider: { path: path.join(homeDir, ".aider", "mcp.yml"), localPath: path.join(process.cwd(), ".aider.mcp.yml"), configKey: "servers", format: "yaml" },
    droid: { path: path.join(homeDir, ".factory", "mcp.json"), localPath: path.join(process.cwd(), ".factory", "mcp.json"), configKey: "mcpServers" },
    opencode: { path: path.join(homeDir, ".config", "opencode", "opencode.json"), localPath: path.join(process.cwd(), ".opencode.json"), configKey: "mcp" },
    witsy: { path: path.join(baseDir, "Witsy", "settings.json"), configKey: "mcpServers" },
    enconvo: { path: path.join(homeDir, ".config", "enconvo", "mcp_config.json"), configKey: "mcpServers" },
    "aider-desk": { path: process.platform === "win32" ? path.join(process.env.APPDATA || path.join(homeDir, "AppData", "Roaming"), "aider-desk", "settings.json") : process.platform === "darwin" ? path.join(homeDir, "Library", "Application Support", "aider-desk", "settings.json") : path.join(homeDir, ".config", "aider-desk", "settings.json"), configKey: "mcpServers" },
    warp: { path: "no-local-config", configKey: "mcpServers" },
  };
}

export const clientNames = Object.keys(getClientTargets());

export function getTarget(client: string, local?: boolean): ClientTarget {
  const targets = getClientTargets();
  const target = targets[client.toLowerCase()];
  if (!target) throw new Error(`Unknown client: ${client}`);
  if (local && target.localPath) return { ...target, path: target.localPath };
  return target;
}

export function isNativeUrlClient(client: string): boolean {
  const targets = getClientTargets();
  return targets[client.toLowerCase()]?.nativeUrl === true;
}

function getNestedValue(obj: ClientConfig, keyPath: string): ClientConfig | undefined {
  return keyPath.split(".").reduce((cur, key) => cur?.[key], obj);
}

function setNestedValue(obj: ClientConfig, keyPath: string, value: ClientConfig): void {
  const keys = keyPath.split(".");
  const last = keys.pop()!;
  const parent = keys.reduce((cur, key) => { if (!cur[key]) cur[key] = {}; return cur[key]; }, obj);
  parent[last] = value;
}

export function readConfig(client: string, local?: boolean): ClientConfig {
  const target = getTarget(client, local);
  if (!fs.existsSync(target.path)) { const config: ClientConfig = {}; setNestedValue(config, target.configKey, {}); return config; }
  const content = fs.readFileSync(target.path, "utf8");
  if (target.format === "yaml") return (yaml.load(content) as ClientConfig) || {};
  if (target.format === "toml") return TOML.parse(content) as ClientConfig;
  return jsonc.parse(content) as ClientConfig;
}

export function writeConfig(serverName: string, serverConfig: ClientConfig, client: string, local?: boolean): string {
  const target = getTarget(client, local);
  const configDir = path.dirname(target.path);
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

  let originalContent = "";
  let existing: ClientConfig = {};
  if (fs.existsSync(target.path)) {
    originalContent = fs.readFileSync(target.path, "utf8");
    if (target.format === "yaml") existing = (yaml.load(originalContent) as ClientConfig) || {};
    else if (target.format === "toml") existing = TOML.parse(originalContent) as ClientConfig;
    else existing = jsonc.parse(originalContent) as ClientConfig;
  }

  if (!getNestedValue(existing, target.configKey)) setNestedValue(existing, target.configKey, {});
  const servers = getNestedValue(existing, target.configKey)!;
  servers[serverName] = serverConfig;

  let output: string;
  if (target.format === "yaml") {
    output = yaml.dump(existing, { indent: 2, lineWidth: -1, noRefs: true });
  } else if (target.format === "toml") {
    output = TOML.stringify(existing);
  } else if (originalContent) {
    try {
      const keyPath = target.configKey.split(".");
      const newValue = getNestedValue(existing, target.configKey);
      const edits = jsonc.modify(originalContent, keyPath, newValue, { formattingOptions: { tabSize: 2, insertSpaces: true } });
      output = jsonc.applyEdits(originalContent, edits);
    } catch { output = JSON.stringify(existing, null, 2); }
  } else {
    output = JSON.stringify(existing, null, 2);
  }

  fs.writeFileSync(target.path, output);
  return target.path;
}
