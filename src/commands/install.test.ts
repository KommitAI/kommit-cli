import { describe, expect, it } from "vitest";

import { resolveConfigScope } from "./install";

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
});
