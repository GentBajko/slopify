import { describe, expect, it } from "vitest";
import { type GeminiLoginHost, readGeminiLogin } from "./gemini-login.js";

function host(
  files: Readonly<Record<string, string>>,
  env: Readonly<Record<string, string>> = {},
): GeminiLoginHost {
  return {
    home: "/home/you",
    env,
    read: async (path) => files[path],
  };
}
const settings = "/home/you/.gemini/settings.json";
const creds = "/home/you/.gemini/oauth_creds.json";
const dotenv = "/home/you/.gemini/.env";
const oauth = JSON.stringify({ access_token: "a", refresh_token: "r" });

describe("readGeminiLogin", () => {
  it("reads a Google sign-in from its saved method and credentials", async () => {
    const chosen = JSON.stringify({ security: { auth: { selectedType: "oauth-personal" } } });
    expect(await readGeminiLogin(host({ [settings]: chosen, [creds]: oauth }))).toBe("signed-in");
    expect(await readGeminiLogin(host({ [settings]: chosen }))).toBe("signed-out");
    expect(await readGeminiLogin(host({ [settings]: chosen, [creds]: JSON.stringify({}) }))).toBe(
      "signed-out",
    );
  });

  it("reads the older flat selectedAuthType too", async () => {
    const chosen = JSON.stringify({ selectedAuthType: "oauth-personal" });
    expect(await readGeminiLogin(host({ [settings]: chosen, [creds]: oauth }))).toBe("signed-in");
  });

  it("takes an API key from the environment or ~/.gemini/.env", async () => {
    const chosen = JSON.stringify({ selectedAuthType: "gemini-api-key" });
    expect(await readGeminiLogin(host({ [settings]: chosen }, { GEMINI_API_KEY: "k" }))).toBe(
      "signed-in",
    );
    expect(
      await readGeminiLogin(host({ [settings]: chosen, [dotenv]: 'export GEMINI_API_KEY="k"\n' })),
    ).toBe("signed-in");
    expect(await readGeminiLogin(host({ [settings]: chosen }, { GEMINI_API_KEY: " " }))).toBe(
      "signed-out",
    );
  });

  it("doesn't block a CLI with nothing saved, and is signed in by a key alone", async () => {
    // It may be signed in some other way (Vertex, a key in its own environment).
    expect(await readGeminiLogin(host({}))).toBe("unknown");
    expect(await readGeminiLogin(host({}, { GEMINI_API_KEY: "k" }))).toBe("signed-in");
    expect(await readGeminiLogin(host({ [creds]: oauth }))).toBe("signed-in");
  });

  it("says unknown for a method it doesn't know or settings it can't place", async () => {
    expect(
      await readGeminiLogin(host({ [settings]: JSON.stringify({ selectedAuthType: "future" }) })),
    ).toBe("unknown");
    expect(await readGeminiLogin(host({ [settings]: JSON.stringify({ theme: "dark" }) }))).toBe(
      "unknown",
    );
    expect(await readGeminiLogin(host({ [settings]: "not json" }))).toBe("unknown");
  });
});
