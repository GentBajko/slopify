import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { geminiWorkspace } from "./gemini-workspace.js";

it("isolates settings while pointing OAuth at the host login, without copying its contents", () => {
  const home = mkdtempSync(join(tmpdir(), "slopify-gemini-login-test-"));
  mkdirSync(join(home, ".gemini"));
  const original =
    '{ // host settings\n "security": { "auth": { "selectedType": "oauth-personal" } }, "context": { "includeDirectories": ["/private"] }, "hooks": { "BeforeAgent": [{"command":"do-not-run"}] }, "mcpServers": {"unrelated": {"command":"do-not-run"}} }';
  const settings = join(home, ".gemini", "settings.json");
  const credentials = join(home, ".gemini", "oauth_creds.json");
  writeFileSync(settings, original);
  writeFileSync(credentials, '{"fake":"test only"}');
  const workspace = geminiWorkspace(false, undefined, undefined, { HOME: home, PATH: "test-bin" });
  try {
    const env = workspace.options.env;
    expect(env?.HOME).toBe(home);
    expect(env?.GOOGLE_APPLICATION_CREDENTIALS).toBe(credentials);
    expect(env?.GEMINI_CLI_SYSTEM_SETTINGS_PATH).toBeUndefined();
    const privateState = join(env?.GEMINI_CLI_HOME ?? "", ".gemini");
    const own = JSON.parse(readFileSync(join(privateState, "settings.json"), "utf8"));
    expect(own.security.auth.selectedType).toBe("oauth-personal");
    expect(own.context.includeDirectories).toEqual([]);
    expect(own.hooksConfig.enabled).toBe(false);
    expect(own.hooks).toEqual({});
    expect(own.mcpServers).toBeUndefined();
    expect(existsSync(join(privateState, "oauth_creds.json"))).toBe(false);
    expect(readFileSync(settings, "utf8")).toBe(original);
  } finally {
    workspace.remove();
    expect(readFileSync(credentials, "utf8")).toBe('{"fake":"test only"}');
    rmSync(home, { recursive: true, force: true });
  }
});
