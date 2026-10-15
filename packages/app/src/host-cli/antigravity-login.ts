import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { HostCliStatus } from "../kernel/ports/host-cli.js";

// The Antigravity CLI has no "auth status" command and keeps a Google sign-in in the system
// keyring, which Slopify does not open. Only its API-key mode is visible in files:
// ~/.gemini/antigravity-cli/settings.json says `"modelProvider": "gemini"` and the key comes
// from GEMINI_API_KEY (antigravity.google/docs/cli/install). Anything else is "unknown".

export interface AntigravityLoginHost {
  readonly home: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  // A text file's contents, or undefined when it can't be read.
  readonly read: (path: string) => Promise<string | undefined>;
}

export function nodeAntigravityLoginHost(): AntigravityLoginHost {
  return {
    home: homedir(),
    env: process.env,
    read: (path) => readFile(path, "utf8").catch(() => undefined),
  };
}

export async function readAntigravityLogin(
  host: AntigravityLoginHost,
): Promise<HostCliStatus["login"]> {
  const raw = await host.read(join(host.home, ".gemini", "antigravity-cli", "settings.json"));
  let provider: unknown;
  try {
    provider =
      raw === undefined
        ? undefined
        : (JSON.parse(raw) as { modelProvider?: unknown }).modelProvider;
  } catch {
    return "unknown";
  }
  if (provider !== "gemini") return "unknown";
  return (host.env.GEMINI_API_KEY ?? "").trim() === "" ? "signed-out" : "signed-in";
}
