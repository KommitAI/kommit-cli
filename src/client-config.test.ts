import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as TOML from "@iarna/toml";
import yaml from "js-yaml";
import * as jsonc from "jsonc-parser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getTarget, projectConfigClientNames, readConfig, writeConfig } from "./client-config";

const originalCwd = process.cwd();
const originalEnv = { ...process.env };

let tempDir: string;
let homeDir: string;
let projectDir: string;

function mkdirp(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function appSupportDir(): string {
  if (process.platform === "win32") return process.env.APPDATA!;
  if (process.platform === "darwin") return path.join(homeDir, "Library", "Application Support");
  return path.join(homeDir, ".config");
}

describe("client config", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kommit-cli-"));
    homeDir = path.join(tempDir, "home");
    projectDir = path.join(tempDir, "project");
    mkdirp(homeDir);
    mkdirp(projectDir);

    process.env = {
      ...originalEnv,
      HOME: homeDir,
      USERPROFILE: homeDir,
      APPDATA: path.join(homeDir, "AppData", "Roaming"),
      CODEX_HOME: path.join(homeDir, ".codex"),
      XDG_CONFIG_HOME: path.join(homeDir, ".config"),
    };
    process.chdir(projectDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = { ...originalEnv };
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes project-scoped JSONC config without dropping unrelated content", () => {
    const configPath = path.join(projectDir, ".cursor", "mcp.json");
    mkdirp(path.dirname(configPath));
    fs.writeFileSync(
      configPath,
      `{
  // keep this comment
  "mcpServers": {
    "existing": {
      "command": "old"
    }
  },
  "otherSetting": true
}
`,
    );

    const writtenPath = writeConfig(
      "kommit",
      { type: "url", url: "https://getkommit.ai/api/mcp", headers: { Authorization: "Bearer test" } },
      "cursor",
      "project",
    );

    expect(fs.realpathSync(writtenPath)).toBe(fs.realpathSync(configPath));
    const content = fs.readFileSync(configPath, "utf8");
    expect(content).toContain("// keep this comment");

    const parsed = jsonc.parse(content);
    expect(parsed.otherSetting).toBe(true);
    expect(parsed.mcpServers.existing.command).toBe("old");
    expect(parsed.mcpServers.kommit.url).toBe("https://getkommit.ai/api/mcp");
  });

  it("writes VS Code config using the current servers key", () => {
    const configPath = path.join(projectDir, ".vscode", "mcp.json");
    const writtenPath = writeConfig(
      "kommit",
      { type: "http", url: "https://getkommit.ai/api/mcp", headers: { Authorization: "Bearer test" } },
      "vscode",
      "project",
    );

    expect(fs.realpathSync(writtenPath)).toBe(fs.realpathSync(configPath));
    const parsed = jsonc.parse(fs.readFileSync(configPath, "utf8"));
    expect(parsed.servers.kommit.type).toBe("http");
    expect(parsed.servers.kommit.url).toBe("https://getkommit.ai/api/mcp");
    expect(parsed.mcpServers).toBeUndefined();
  });

  it("writes Gemini CLI streamable HTTP config", () => {
    const configPath = path.join(projectDir, ".gemini", "settings.json");
    const writtenPath = writeConfig(
      "kommit",
      { httpUrl: "https://getkommit.ai/api/mcp", headers: { Authorization: "Bearer test" } },
      "gemini-cli",
      "project",
    );

    expect(fs.realpathSync(writtenPath)).toBe(fs.realpathSync(configPath));
    const parsed = jsonc.parse(fs.readFileSync(configPath, "utf8"));
    expect(parsed.mcpServers.kommit.httpUrl).toBe("https://getkommit.ai/api/mcp");
    expect(parsed.mcpServers.kommit.headers.Authorization).toBe("Bearer test");
    expect(parsed.mcpServers.kommit.command).toBeUndefined();
  });

  it("writes Zed remote context server config", () => {
    const configPath = path.join(homeDir, ".config", "zed", "settings.json");
    const writtenPath = writeConfig(
      "kommit",
      { url: "https://getkommit.ai/api/mcp", headers: { Authorization: "Bearer test" } },
      "zed",
      "user",
    );

    expect(writtenPath).toBe(configPath);
    const parsed = jsonc.parse(fs.readFileSync(configPath, "utf8"));
    expect(parsed.context_servers.kommit.url).toBe("https://getkommit.ai/api/mcp");
    expect(parsed.context_servers.kommit.headers.Authorization).toBe("Bearer test");
    expect(parsed.context_servers.kommit.command).toBeUndefined();
  });

  it("writes OpenCode project config to opencode.json in the project root", () => {
    const configPath = path.join(projectDir, "opencode.json");
    const writtenPath = writeConfig(
      "kommit",
      { type: "remote", url: "https://getkommit.ai/api/mcp", enabled: true, headers: { Authorization: "Bearer test" } },
      "opencode",
      "project",
    );

    expect(fs.realpathSync(writtenPath)).toBe(fs.realpathSync(configPath));
    expect(fs.existsSync(path.join(projectDir, ".opencode.json"))).toBe(false);
    const parsed = jsonc.parse(fs.readFileSync(configPath, "utf8"));
    expect(parsed.mcp.kommit.type).toBe("remote");
    expect(parsed.mcp.kommit.url).toBe("https://getkommit.ai/api/mcp");
    expect(parsed.mcp.kommit.headers.Authorization).toBe("Bearer test");
  });

  it("writes Droid project config under .factory/mcp.json", () => {
    const configPath = path.join(projectDir, ".factory", "mcp.json");
    const writtenPath = writeConfig(
      "kommit",
      { type: "http", url: "https://getkommit.ai/api/mcp", headers: { Authorization: "Bearer test" } },
      "droid",
      "project",
    );

    expect(fs.realpathSync(writtenPath)).toBe(fs.realpathSync(configPath));
    const parsed = jsonc.parse(fs.readFileSync(configPath, "utf8"));
    expect(parsed.mcpServers.kommit.type).toBe("http");
    expect(parsed.mcpServers.kommit.url).toBe("https://getkommit.ai/api/mcp");
    expect(parsed.mcpServers.kommit.headers.Authorization).toBe("Bearer test");
    expect(parsed.mcpServers.kommit.command).toBeUndefined();
  });

  it("writes Roo Cline config to VS Code global storage", () => {
    const configPath = path.join(
      appSupportDir(),
      "Code",
      "User",
      "globalStorage",
      "rooveterinaryinc.roo-cline",
      "settings",
      "mcp_settings.json",
    );
    const writtenPath = writeConfig("kommit", { command: "npx", args: ["-y", "mcp-remote@latest"] }, "roo-cline", "user");

    expect(writtenPath).toBe(configPath);
    const parsed = jsonc.parse(fs.readFileSync(configPath, "utf8"));
    expect(parsed.mcpServers.kommit.command).toBe("npx");
  });

  it("writes Witsy config under application support", () => {
    const configPath = path.join(
      appSupportDir(),
      "Witsy",
      "settings.json",
    );
    const writtenPath = writeConfig("kommit", { command: "npx", args: ["-y", "mcp-remote@latest"] }, "witsy", "user");

    expect(writtenPath).toBe(configPath);
    const parsed = jsonc.parse(fs.readFileSync(configPath, "utf8"));
    expect(parsed.mcpServers.kommit.command).toBe("npx");
  });

  it("writes Enconvo config under .config/enconvo", () => {
    const configPath = path.join(homeDir, ".config", "enconvo", "mcp_config.json");
    const writtenPath = writeConfig("kommit", { command: "npx", args: ["-y", "mcp-remote@latest"] }, "enconvo", "user");

    expect(writtenPath).toBe(configPath);
    const parsed = jsonc.parse(fs.readFileSync(configPath, "utf8"));
    expect(parsed.mcpServers.kommit.command).toBe("npx");
  });

  it("writes Aider Desk config to its user settings file", () => {
    const configPath = path.join(
      appSupportDir(),
      "aider-desk",
      "settings.json",
    );
    const writtenPath = writeConfig("kommit", { command: "npx", args: ["-y", "mcp-remote@latest"] }, "aider-desk", "user");

    expect(writtenPath).toBe(configPath);
    const parsed = jsonc.parse(fs.readFileSync(configPath, "utf8"));
    expect(parsed.mcpServers.kommit.command).toBe("npx");
  });

  it("writes YAML config while preserving other top-level keys", () => {
    const configPath = path.join(homeDir, ".config", "goose", "config.yaml");
    mkdirp(path.dirname(configPath));
    fs.writeFileSync(configPath, "extensions:\n  old:\n    cmd: old\nother: true\n");

    const writtenPath = writeConfig("kommit", { name: "kommit", cmd: "npx", args: ["-y"], enabled: true }, "goose", "user");

    expect(writtenPath).toBe(configPath);
    const parsed = yaml.load(fs.readFileSync(configPath, "utf8")) as Record<string, any>;
    expect(parsed.other).toBe(true);
    expect(parsed.extensions.old.cmd).toBe("old");
    expect(parsed.extensions.kommit.cmd).toBe("npx");
  });

  it("writes TOML config while preserving existing settings", () => {
    const configPath = path.join(homeDir, ".codex", "config.toml");
    mkdirp(path.dirname(configPath));
    fs.writeFileSync(configPath, 'model = "gpt-5"\n\n[mcp_servers.old]\ncommand = "old"\n');

    const writtenPath = writeConfig("kommit", { command: "npx", args: ["-y", "mcp-remote@latest"] }, "codex", "user");

    expect(writtenPath).toBe(configPath);
    const parsed = TOML.parse(fs.readFileSync(configPath, "utf8")) as Record<string, any>;
    expect(parsed.model).toBe("gpt-5");
    expect(parsed.mcp_servers.old.command).toBe("old");
    expect(parsed.mcp_servers.kommit.command).toBe("npx");
  });

  it("writes Codex native HTTP config in TOML", () => {
    const configPath = path.join(homeDir, ".codex", "config.toml");
    mkdirp(path.dirname(configPath));

    writeConfig(
      "kommit",
      { url: "https://getkommit.ai/api/mcp", http_headers: { Authorization: "Bearer test" } },
      "codex",
      "user",
    );

    const parsed = TOML.parse(fs.readFileSync(configPath, "utf8")) as Record<string, any>;
    expect(parsed.mcp_servers.kommit.url).toBe("https://getkommit.ai/api/mcp");
    expect(parsed.mcp_servers.kommit.http_headers.Authorization).toBe("Bearer test");
    expect(parsed.mcp_servers.kommit.command).toBeUndefined();
  });

  it("rejects project scope for clients that only have user config", () => {
    expect(projectConfigClientNames()).toContain("cursor");
    expect(projectConfigClientNames()).not.toContain("codex");
    expect(() => getTarget("codex", "project")).toThrow(/codex does not support project-scoped config/);
    expect(() => writeConfig("kommit", { command: "npx" }, "codex", "project")).toThrow(
      /codex does not support project-scoped config/,
    );
    expect(fs.existsSync(path.join(homeDir, ".codex", "config.toml"))).toBe(false);
  });

  it("rejects invalid scope values instead of silently using user config", () => {
    expect(() => getTarget("cursor", "local" as any)).toThrow(/Invalid config scope: local/);
    expect(() => writeConfig("kommit", { command: "npx" }, "cursor", "local" as any)).toThrow(
      /Invalid config scope: local/,
    );
  });

  it("fails clearly when JSONC server container is not an object without rewriting the file", () => {
    const configPath = path.join(projectDir, ".cursor", "mcp.json");
    mkdirp(path.dirname(configPath));
    const originalContent = `{
  "mcpServers": true,
  "otherSetting": true
}
`;
    fs.writeFileSync(configPath, originalContent);

    expect(() => writeConfig("kommit", { command: "npx" }, "cursor", "project")).toThrow(
      /Config key "mcpServers"[\s\S]*must be an object[\s\S]*no changes were written/,
    );
    expect(fs.readFileSync(configPath, "utf8")).toBe(originalContent);
  });

  it("fails clearly when YAML server container is not an object without rewriting the file", () => {
    const configPath = path.join(homeDir, ".config", "goose", "config.yaml");
    mkdirp(path.dirname(configPath));
    const originalContent = "extensions:\n  - old\nother: true\n";
    fs.writeFileSync(configPath, originalContent);

    expect(() => writeConfig("kommit", { command: "npx" }, "goose", "user")).toThrow(
      /Config key "extensions"[\s\S]*must be an object[\s\S]*no changes were written/,
    );
    expect(fs.readFileSync(configPath, "utf8")).toBe(originalContent);
  });

  it("fails clearly when TOML server container is not an object without rewriting the file", () => {
    const configPath = path.join(homeDir, ".codex", "config.toml");
    mkdirp(path.dirname(configPath));
    const originalContent = 'model = "gpt-5"\nmcp_servers = "bad"\n';
    fs.writeFileSync(configPath, originalContent);

    expect(() => writeConfig("kommit", { command: "npx" }, "codex", "user")).toThrow(
      /Config key "mcp_servers"[\s\S]*must be an object[\s\S]*no changes were written/,
    );
    expect(fs.readFileSync(configPath, "utf8")).toBe(originalContent);
  });

  it("fails with an actionable error for malformed JSONC without rewriting the file", () => {
    const configPath = path.join(projectDir, ".cursor", "mcp.json");
    mkdirp(path.dirname(configPath));
    const originalContent = "{\n  \"mcpServers\": {\n";
    fs.writeFileSync(configPath, originalContent);

    expect(() => writeConfig("kommit", { command: "npx" }, "cursor", "project")).toThrow(
      /Could not parse JSONC config[\s\S]*Fix the file and rerun; no changes were written/,
    );
    expect(fs.readFileSync(configPath, "utf8")).toBe(originalContent);
  });

  it("fails with an actionable error for malformed YAML without rewriting the file", () => {
    const configPath = path.join(homeDir, ".config", "goose", "config.yaml");
    mkdirp(path.dirname(configPath));
    const originalContent = "extensions:\n  kommit: [unterminated\n";
    fs.writeFileSync(configPath, originalContent);

    expect(() => writeConfig("kommit", { command: "npx" }, "goose", "user")).toThrow(
      /Could not parse YAML config[\s\S]*Fix the file and rerun; no changes were written/,
    );
    expect(fs.readFileSync(configPath, "utf8")).toBe(originalContent);
  });

  it("fails with an actionable error for malformed TOML without rewriting the file", () => {
    const configPath = path.join(homeDir, ".codex", "config.toml");
    mkdirp(path.dirname(configPath));
    const originalContent = "[mcp_servers.kommit\ncommand = \"npx\"\n";
    fs.writeFileSync(configPath, originalContent);

    expect(() => readConfig("codex", "user")).toThrow(
      /Could not parse TOML config[\s\S]*Fix the file and rerun; no changes were written/,
    );
    expect(fs.readFileSync(configPath, "utf8")).toBe(originalContent);
  });
});
