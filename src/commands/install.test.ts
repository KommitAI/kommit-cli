import { describe, expect, it } from "vitest";

import { createServerConfig, resolveConfigScope } from "./install";

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
});
