import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    prompt: vi.fn(),
    warn: vi.fn(),
  },
}));

import { authenticateViaBrowser, generatePkcePair, validateKey } from "./auth";
import { logger } from "./logger";

const originalEnv = { ...process.env };
const originalFetch = global.fetch;
const packageVersion = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")).version as string;

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
    global.fetch = originalFetch;
  });

  it("returns null immediately in headless SSH environments", async () => {
    await expect(authenticateViaBrowser()).resolves.toBeNull();

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Headless environment detected"));
  });
});

describe("validateKey", () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("sends an MCP initialize request with bearer auth and CLI version metadata", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ result: { serverInfo: { name: "kommit" } } }),
    })) as unknown as typeof fetch;
    global.fetch = fetchMock;

    await expect(validateKey("km_test")).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://getkommit.ai/api/mcp",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
          "Authorization": "Bearer km_test",
        },
      }),
    );

    const [, init] = vi.mocked(fetchMock).mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "kommit-cli", version: packageVersion },
      },
    });
  });

  it("returns false when the MCP endpoint rejects the key", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;

    await expect(validateKey("bad_key")).resolves.toBe(false);
  });

  it("returns false when initialize response has no serverInfo", async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ result: {} }) })) as unknown as typeof fetch;

    await expect(validateKey("km_test")).resolves.toBe(false);
  });

  it("returns false when validation request fails", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    await expect(validateKey("km_test")).resolves.toBe(false);
  });
});
