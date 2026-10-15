import { describe, expect, it } from "vitest";
import { type AntigravityLoginHost, readAntigravityLogin } from "./antigravity-login.js";

function host(
  files: Readonly<Record<string, string>>,
  env: Readonly<Record<string, string>> = {},
): AntigravityLoginHost {
  return { home: "/home/you", env, read: async (path) => files[path] };
}
const settings = "/home/you/.gemini/antigravity-cli/settings.json";
const apiKeyMode = JSON.stringify({ modelProvider: "gemini" });

describe("readAntigravityLogin", () => {
  it("reads API-key mode from its settings and GEMINI_API_KEY", async () => {
    expect(
      await readAntigravityLogin(host({ [settings]: apiKeyMode }, { GEMINI_API_KEY: "k" })),
    ).toBe("signed-in");
    expect(await readAntigravityLogin(host({ [settings]: apiKeyMode }))).toBe("signed-out");
    expect(
      await readAntigravityLogin(host({ [settings]: apiKeyMode }, { GEMINI_API_KEY: " " })),
    ).toBe("signed-out");
  });

  it("says unknown for a Google sign-in, which lives in the system keyring", async () => {
    expect(await readAntigravityLogin(host({}))).toBe("unknown");
    expect(await readAntigravityLogin(host({}, { GEMINI_API_KEY: "k" }))).toBe("unknown");
    expect(await readAntigravityLogin(host({ [settings]: "{}" }))).toBe("unknown");
    expect(await readAntigravityLogin(host({ [settings]: "not json" }))).toBe("unknown");
  });
});
