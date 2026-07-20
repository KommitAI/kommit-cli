import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth", () => ({
  authenticateViaBrowser: vi.fn(),
  authenticateViaPrompt: vi.fn(),
  validateKey: vi.fn(async () => true),
}));

vi.mock("../logger", () => ({
  logger: {
    box: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    prompt: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("../client-config", () => ({
  clientNames: ["cursor", "codex", "warp"],
  getTarget: vi.fn((client: string, scope: string) => {
    if (client === "codex" && scope === "project") {
      throw new Error("codex does not support project-scoped config");
    }
    if (client === "warp") {
      return { manual: true, configKey: "mcpServers" };
    }
    return { path: "/tmp/kommit-config", configKey: "mcpServers" };
  }),
  writeConfig: vi.fn(() => "/tmp/kommit-config"),
}));

import { authenticateViaBrowser, authenticateViaPrompt, validateKey } from "../auth";
import { getTarget, writeConfig } from "../client-config";
import { logger } from "../logger";
import { handler } from "./install";

describe("handler auth ordering", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticateViaBrowser).mockResolvedValue(null);
    vi.mocked(authenticateViaPrompt).mockResolvedValue("km_prompt");
    vi.mocked(validateKey).mockResolvedValue(true);
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit:${code}`);
    }) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it("rejects unsupported project scope before validating or prompting for an API key", async () => {
    await expect(
      handler({ client: "codex", scope: "project", key: "km_test", _: [], $0: "kommit" } as any),
    ).rejects.toThrow("process.exit:1");

    expect(validateKey).not.toHaveBeenCalled();
    expect(authenticateViaBrowser).not.toHaveBeenCalled();
    expect(authenticateViaPrompt).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("codex does not support project-scoped config"));
  });

  it("trims an API key provided with --key before validating and writing config", async () => {
    await handler({ client: "cursor", scope: "user", key: "  km_test  ", _: [], $0: "kommit" } as any);

    expect(authenticateViaBrowser).not.toHaveBeenCalled();
    expect(authenticateViaPrompt).not.toHaveBeenCalled();
    expect(validateKey).toHaveBeenCalledWith("km_test");
    expect(writeConfig).toHaveBeenCalledWith(
      "kommit",
      expect.objectContaining({ headers: { Authorization: "Bearer km_test" } }),
      "cursor",
      "user",
    );
  });

  it("falls back to prompt auth when browser auth returns no key", async () => {
    await handler({ client: "cursor", scope: "user", _: [], $0: "kommit" } as any);

    expect(authenticateViaBrowser).toHaveBeenCalledOnce();
    expect(authenticateViaPrompt).toHaveBeenCalledOnce();
    expect(validateKey).toHaveBeenCalledWith("km_prompt");
  });

  it("aborts clearly when interactive client selection is cancelled", async () => {
    vi.mocked(logger.prompt).mockResolvedValue(undefined as unknown as string);

    await expect(handler({ scope: "user", key: "km_test", _: [], $0: "kommit" } as any)).rejects.toThrow("process.exit:1");

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("No client selected"));
    expect(getTarget).not.toHaveBeenCalled();
    expect(validateKey).not.toHaveBeenCalled();
    expect(authenticateViaBrowser).not.toHaveBeenCalled();
    expect(authenticateViaPrompt).not.toHaveBeenCalled();
    expect(writeConfig).not.toHaveBeenCalled();
  });

  it("prints Warp manual setup config without writing a config file", async () => {
    await handler({ client: "warp", scope: "user", key: "  km_test  ", name: "memory", _: [], $0: "kommit" } as any);

    expect(validateKey).toHaveBeenCalledWith("km_test");
    expect(writeConfig).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith("Warp requires manual setup through their UI.");

    const output = vi.mocked(logger.log).mock.calls.map(([message]) => String(message ?? "")).join("\n");
    expect(output).toContain('"memory"');
    expect(output).toContain("mcp-remote@latest");
    expect(output).toContain("Authorization: Bearer km_test");
    expect(output).not.toContain("  km_test  ");
  });
});
