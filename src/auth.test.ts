import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    prompt: vi.fn(),
    warn: vi.fn(),
  },
}));

import { authenticateViaBrowser, generatePkcePair } from "./auth";
import { logger } from "./logger";

const originalEnv = { ...process.env };

describe("generatePkcePair", () => {
  it("generates RFC 7636-compatible verifier and challenge strings", () => {
    const { codeVerifier, codeChallenge } = generatePkcePair();

    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(codeChallenge).not.toBe(codeVerifier);
  });
});

describe("authenticateViaBrowser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, SSH_CLIENT: "127.0.0.1 12345 22" };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns null immediately in headless SSH environments", async () => {
    await expect(authenticateViaBrowser()).resolves.toBeNull();

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Headless environment detected"));
  });
});
