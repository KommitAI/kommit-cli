import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockOpen } = vi.hoisted(() => ({
  mockOpen: vi.fn(async (_url: string) => undefined),
}));

vi.mock("open", () => ({
  default: mockOpen,
}));

vi.mock("./logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    prompt: vi.fn(),
    warn: vi.fn(),
  },
}));

import { authenticateViaBrowser, authenticateViaPrompt, generatePkcePair, validateKey } from "./auth";
import { logger } from "./logger";

const originalEnv = { ...process.env };
const originalFetch = global.fetch;
const packageVersion = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")).version as string;

function requestLocalCallback(url: string): Promise<{ statusCode: number | undefined; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => { resolve({ statusCode: res.statusCode, body }); });
    }).on("error", reject);
  });
}

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

  it("keeps a localhost callback server open and exchanges the auth code", async () => {
    process.env = { ...originalEnv, DISPLAY: originalEnv.DISPLAY ?? ":99" };
    delete process.env.SSH_CLIENT;
    delete process.env.SSH_TTY;

    let openedUrl = "";
    mockOpen.mockImplementation(async (url: string) => {
      openedUrl = String(url);
    });

    const fetchMock = vi.fn(async () => ({
      json: async () => ({ key: "km_browser" }),
    })) as unknown as typeof fetch;
    global.fetch = fetchMock;

    const authPromise = authenticateViaBrowser();
    await vi.waitFor(() => expect(openedUrl).toContain("https://getkommit.ai/cli-auth?"));

    const authUrl = new URL(openedUrl);
    const port = authUrl.searchParams.get("port");
    expect(port).toMatch(/^\d+$/);
    expect(authUrl.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");

    const response = await requestLocalCallback(`http://127.0.0.1:${port}/callback?code=test_code`);
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("Authenticated!");
    await expect(authPromise).resolves.toBe("km_browser");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://getkommit.ai/api/cli-auth/exchange",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.any(String),
      }),
    );
    const [, init] = vi.mocked(fetchMock).mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      code: "test_code",
      code_verifier: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
  });
});

describe("authenticateViaPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("trims prompt-entered API keys", async () => {
    vi.mocked(logger.prompt).mockResolvedValue("  km_prompt  ");

    await expect(authenticateViaPrompt()).resolves.toBe("km_prompt");
  });

  it("returns an empty key when the prompt is cancelled", async () => {
    vi.mocked(logger.prompt).mockResolvedValue(undefined as unknown as string);

    await expect(authenticateViaPrompt()).resolves.toBe("");
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

  it("trims API keys before validating", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ result: { serverInfo: { name: "kommit" } } }),
    })) as unknown as typeof fetch;
    global.fetch = fetchMock;

    await expect(validateKey("  km_test  ")).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ "Authorization": "Bearer km_test" }),
      }),
    );
  });

  it("rejects blank API keys without calling the MCP endpoint", async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    global.fetch = fetchMock;

    await expect(validateKey("   ")).resolves.toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
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
