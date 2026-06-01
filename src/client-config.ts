import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import * as TOML from "@iarna/toml";
import yaml from "js-yaml";
import * as jsonc from "jsonc-parser";

// biome-ignore lint/suspicious/noExplicitAny: flexible config structure
export type ClientConfig = Record<string, any>;
export type ConfigScope = "user" | "project";

interface FileClientTarget {
  path: string;
  localPath?: string;
  configKey: string;
  format?: "json" | "yaml" | "toml";
  manual?: false;
}

interface ManualClientTarget {
  manual: true;
  configKey: string;
}

type ClientTarget = FileClientTarget | ManualClientTarget;

function getFormatName(target: FileClientTarget): string {
  if (target.format === "yaml") return "YAML";
  if (target.format === "toml") return "TOML";
  return "JSONC";
}

function getPlatformPaths() {
  const homeDir = getHomeDir();
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

function getHomeDir(): string {
  if (process.platform === "win32") return process.env.USERPROFILE || os.homedir();
  return process.env.HOME || os.homedir();
}

function getClientTargets(): Record<string, ClientTarget> {
  const { baseDir, vscodePath } = getPlatformPaths();
  const homeDir = getHomeDir();
  return {
    "claude-code": { path: path.join(homeDir, ".claude.json"), localPath: path.join(process.cwd(), ".mcp.json"), configKey: "mcpServers" },
    cursor: { path: path.join(homeDir, ".cursor", "mcp.json"), localPath: path.join(process.cwd(), ".cursor", "mcp.json"), configKey: "mcpServers" },
    vscode: { path: path.join(baseDir, vscodePath, "mcp.json"), localPath: path.join(process.cwd(), ".vscode", "mcp.json"), configKey: "servers" },
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
    opencode: { path: path.join(homeDir, ".config", "opencode", "opencode.json"), localPath: path.join(process.cwd(), "opencode.json"), configKey: "mcp" },
    witsy: { path: path.join(baseDir, "Witsy", "settings.json"), configKey: "mcpServers" },
    enconvo: { path: path.join(homeDir, ".config", "enconvo", "mcp_config.json"), configKey: "mcpServers" },
    "aider-desk": { path: process.platform === "win32" ? path.join(process.env.APPDATA || path.join(homeDir, "AppData", "Roaming"), "aider-desk", "settings.json") : process.platform === "darwin" ? path.join(homeDir, "Library", "Application Support", "aider-desk", "settings.json") : path.join(homeDir, ".config", "aider-desk", "settings.json"), configKey: "mcpServers" },
    warp: { manual: true, configKey: "mcpServers" },
  };
}

export const clientNames = Object.keys(getClientTargets());

function normalizeScope(scope?: ConfigScope | boolean): ConfigScope {
  if (scope === true || scope === "project") return "project";
  if (scope === false || scope === undefined || scope === "user") return "user";
  throw new Error(`Invalid config scope: ${String(scope)}. Use "user" or "project".`);
}

export function projectConfigClientNames(): string[] {
  return Object.entries(getClientTargets())
    .filter(([, target]) => !target.manual && !!target.localPath)
    .map(([client]) => client);
}

export function getTarget(client: string, scope?: ConfigScope | boolean): ClientTarget {
  const targets = getClientTargets();
  const target = targets[client.toLowerCase()];
  if (!target) throw new Error(`Unknown client: ${client}`);
  if (normalizeScope(scope) === "project") {
    if (target.manual || !target.localPath) {
      throw new Error(
        `${client} does not support project-scoped config. Supported project-scoped clients: ${projectConfigClientNames().join(", ")}`,
      );
    }
    return { ...target, path: target.localPath };
  }
  return target;
}

function requireFileTarget(client: string, target: ClientTarget): FileClientTarget {
  if (target.manual) {
    throw new Error(`${client} requires manual setup through its UI. No config file was read or written.`);
  }
  return target;
}

function isConfigObject(value: unknown): value is ClientConfig {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function setNestedValue(obj: ClientConfig, keyPath: string, value: ClientConfig): void {
  const keys = keyPath.split(".");
  const last = keys.pop()!;
  const parent = keys.reduce((cur, key) => {
    const next = cur[key];
    if (next === undefined) {
      cur[key] = {};
      return cur[key];
    }
    if (!isConfigObject(next)) {
      throw new Error(`Config key "${key}" must be an object.`);
    }
    return next;
  }, obj);
  parent[last] = value;
}

function ensureNestedObject(obj: ClientConfig, keyPath: string, targetPath: string): ClientConfig {
  const keys = keyPath.split(".");
  let cur: ClientConfig = obj;
  let currentPath = "";

  for (const key of keys) {
    currentPath = currentPath ? `${currentPath}.${key}` : key;
    const next = cur[key];
    if (next === undefined) {
      cur[key] = {};
      cur = cur[key];
      continue;
    }
    if (!isConfigObject(next)) {
      throw new Error(
        `Config key "${currentPath}" in ${targetPath} must be an object. Fix the file and rerun; no changes were written.`,
      );
    }
    cur = next;
  }

  return cur;
}

function parseJsoncConfig(content: string, targetPath: string): ClientConfig {
  const errors: jsonc.ParseError[] = [];
  const parsed = jsonc.parse(content, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    const firstError = errors[0];
    const prefix = content.slice(0, firstError.offset);
    const lines = prefix.split(/\r\n|\r|\n/);
    const line = lines.length;
    const column = lines[lines.length - 1].length + 1;
    throw new Error(`JSONC parse error at line ${line}, column ${column}: ${jsonc.printParseErrorCode(firstError.error)}`);
  }
  if (parsed === undefined) return {};
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("top-level value must be an object");
  }
  return parsed as ClientConfig;
}

function parseConfigContent(content: string, target: FileClientTarget): ClientConfig {
  try {
    let parsed: unknown;
    if (target.format === "yaml") parsed = yaml.load(content) || {};
    else if (target.format === "toml") parsed = TOML.parse(content);
    else parsed = parseJsoncConfig(content, target.path);

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("top-level value must be an object");
    }
    return parsed as ClientConfig;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not parse ${getFormatName(target)} config at ${target.path}: ${detail}. Fix the file and rerun; no changes were written.`,
    );
  }
}

function writeFileAtomic(targetPath: string, content: string): void {
  const tempPath = path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tempPath, content);
    if (fs.existsSync(targetPath)) {
      fs.chmodSync(tempPath, fs.statSync(targetPath).mode);
    }
    fs.renameSync(tempPath, targetPath);
  } catch (err) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      // Ignore cleanup failures and report the original write error.
    }
    throw err;
  }
}

export function readConfig(client: string, scope?: ConfigScope | boolean): ClientConfig {
  const target = requireFileTarget(client, getTarget(client, scope));
  if (!fs.existsSync(target.path)) { const config: ClientConfig = {}; setNestedValue(config, target.configKey, {}); return config; }
  const content = fs.readFileSync(target.path, "utf8");
  return parseConfigContent(content, target);
}

export function writeConfig(serverName: string, serverConfig: ClientConfig, client: string, scope?: ConfigScope | boolean): string {
  const target = requireFileTarget(client, getTarget(client, scope));
  const configDir = path.dirname(target.path);
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

  let originalContent = "";
  let existing: ClientConfig = {};
  if (fs.existsSync(target.path)) {
    originalContent = fs.readFileSync(target.path, "utf8");
    existing = parseConfigContent(originalContent, target);
  }

  const servers = ensureNestedObject(existing, target.configKey, target.path);
  servers[serverName] = serverConfig;

  let output: string;
  if (target.format === "yaml") {
    output = yaml.dump(existing, { indent: 2, lineWidth: -1, noRefs: true });
  } else if (target.format === "toml") {
    output = TOML.stringify(existing);
  } else if (originalContent) {
    try {
      const keyPath = [...target.configKey.split("."), serverName];
      const edits = jsonc.modify(originalContent, keyPath, serverConfig, { formattingOptions: { tabSize: 2, insertSpaces: true } });
      output = jsonc.applyEdits(originalContent, edits);
    } catch { output = JSON.stringify(existing, null, 2); }
  } else {
    output = JSON.stringify(existing, null, 2);
  }

  writeFileAtomic(target.path, output);
  return target.path;
}
