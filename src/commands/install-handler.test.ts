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

import { authenticateViaBrowser, authenticateViaPrompt, validateKey } from "../auth";
import { logger } from "../logger";
import { handler } from "./install";

describe("handler auth ordering", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
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
});
