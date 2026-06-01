import { describe, expect, it } from "vitest";
import yargs from "yargs";
import type { ArgumentsCamelCase, Argv } from "yargs";

import { builder, createServerConfig, resolveConfigScope, type InstallArgs } from "./install";

async function parseCliArgs(args: string[]): Promise<ArgumentsCamelCase<InstallArgs>> {
  return await new Promise((resolve, reject) => {
    void yargs(args)
      .command({
        command: "$0",
        describe: "Install the Kommit MCP server",
        builder: (y) => builder(y as unknown as Argv<InstallArgs>),
        handler: (argv) => resolve(argv as ArgumentsCamelCase<InstallArgs>),
      })
      .strict()
      .exitProcess(false)
      .fail((message, error) => reject(error ?? new Error(message)))
      .parse();
  });
}

describe("resolveConfigScope", () => {
  it("defaults to user scope", () => {
    expect(resolveConfigScope({})).toBe("user");
  });

  it("supports explicit scope and legacy aliases", () => {
    expect(resolveConfigScope({ scope: "project" })).toBe("project");
    expect(resolveConfigScope({ scope: "user" })).toBe("user");
    expect(resolveConfigScope({ local: true })).toBe("project");
    expect(resolveConfigScope({ global: true })).toBe("user");
  });

  it("rejects conflicting scope flags", () => {
    expect(() => resolveConfigScope({ global: true, local: true })).toThrow(/Use only one/);
    expect(() => resolveConfigScope({ scope: "project", global: true })).toThrow(/Use either --scope/);
    expect(() => resolveConfigScope({ scope: "user", local: true })).toThrow(/Use either --scope/);
  });

  it("rejects invalid scope values instead of falling back to user scope", () => {
    expect(() => resolveConfigScope({ scope: "local" as any })).toThrow(/Invalid --scope "local"/);
  });
});

describe("builder", () => {
  it("parses supported CLI flags through yargs", async () => {
    await expect(
      parseCliArgs(["--client", "cursor", "--scope", "project", "--name", "memory", "--key", "km_test"]),
    ).resolves.toEqual(
      expect.objectContaining({
        client: "cursor",
        scope: "project",
        name: "memory",
        key: "km_test",
      }),
    );
  });

  it("rejects unsupported client choices before the handler runs", async () => {
    await expect(parseCliArgs(["--client", "unknown"])).rejects.toThrow(/Invalid values/);
  });

  it("rejects unsupported scope choices before the handler runs", async () => {
    await expect(parseCliArgs(["--client", "cursor", "--scope", "local"])).rejects.toThrow(/Invalid values/);
  });

  it("rejects unknown flags in strict mode", async () => {
    await expect(parseCliArgs(["--client", "cursor", "--workspace"])).rejects.toThrow(/Unknown argument/);
  });
});

describe("createServerConfig", () => {
  it("uses current HTTP config shape for VS Code", () => {
    expect(createServerConfig("vscode", "kommit", "km_test")).toEqual({
      type: "http",
      url: "https://getkommit.ai/api/mcp",
      headers: { Authorization: "Bearer km_test" },
    });
  });

  it("uses Cursor's mcp.json remote URL shape", () => {
    expect(createServerConfig("cursor", "kommit", "km_test")).toEqual({
      url: "https://getkommit.ai/api/mcp",
      headers: { Authorization: "Bearer km_test" },
    });
  });

  it("uses Codex's native HTTP TOML shape", () => {
    expect(createServerConfig("codex", "kommit", "km_test")).toEqual({
      url: "https://getkommit.ai/api/mcp",
      http_headers: { Authorization: "Bearer km_test" },
    });
  });

  it("uses Gemini CLI's streamable HTTP config shape", () => {
    expect(createServerConfig("gemini-cli", "kommit", "km_test")).toEqual({
      httpUrl: "https://getkommit.ai/api/mcp",
      headers: { Authorization: "Bearer km_test" },
    });
  });

  it("uses Zed's remote context server config shape", () => {
    expect(createServerConfig("zed", "kommit", "km_test")).toEqual({
      url: "https://getkommit.ai/api/mcp",
      headers: { Authorization: "Bearer km_test" },
    });
  });

  it("uses Droid's native HTTP MCP config shape", () => {
    expect(createServerConfig("droid", "kommit", "km_test")).toEqual({
      type: "http",
      url: "https://getkommit.ai/api/mcp",
      headers: { Authorization: "Bearer km_test" },
    });
  });
});
