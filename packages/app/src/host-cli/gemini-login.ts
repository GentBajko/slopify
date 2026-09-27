import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { HostCliStatus } from "../kernel/ports/host-cli.js";

// The Gemini CLI has no "auth status" command, but it keeps its choice and its credentials in
// files: ~/.gemini/settings.json names the sign-in method (`security.auth.selectedType`, or
// `selectedAuthType` in older versions), ~/.gemini/oauth_creds.json holds a Google sign-in's
// refresh token, and an API key comes from GEMINI_API_KEY in the environment or ~/.gemini/.env.
// Reading them answers "signed in?" without starting the CLI or touching the network.

export interface GeminiLoginHost {
  readonly home: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  // A text file's contents, or undefined when it can't be read.
  readonly read: (path: string) => Promise<string | undefined>;
}

export function nodeGeminiLoginHost(): GeminiLoginHost {
  return {
    home: homedir(),
    env: process.env,
    read: (path) => readFile(path, "utf8").catch(() => undefined),
  };
}

export async function readGeminiLogin(host: GeminiLoginHost): Promise<HostCliStatus["login"]> {
  const folder = join(host.home, ".gemini");
  const raw = await host.read(join(folder, "settings.json"));
  const settings = parse(raw);
  const method = selectedAuth(settings);
  const hasKey = async (name: string): Promise<boolean> =>
    nonEmpty(host.env[name]) || dotenvHas(await host.read(join(folder, ".env")), name);
  const oauth = async (): Promise<boolean> => {
    const creds = parse(await host.read(join(folder, "oauth_creds.json")));
    return typeof creds?.refresh_token === "string" && creds.refresh_token !== "";
  };
  switch (method) {
    case "oauth-personal":
    case "login-with-google":
      return (await oauth()) ? "signed-in" : "signed-out";
    case "gemini-api-key":
      return (await hasKey("GEMINI_API_KEY")) ? "signed-in" : "signed-out";
    case "vertex-ai":
      return (await hasKey("GOOGLE_API_KEY")) || (await hasKey("GOOGLE_CLOUD_PROJECT"))
        ? "signed-in"
        : "signed-out";
    case "cloud-shell":
      return "signed-in";
    case undefined:
      // No choice saved yet: the CLI still starts without asking when a key or an earlier
      // Google sign-in is there; otherwise it opens its sign-in menu.
      if ((await hasKey("GEMINI_API_KEY")) || (await oauth())) return "signed-in";
      // Nothing saved says nothing either: the CLI can be signed in some other way (Vertex or
      // a key in its own environment), so only a sign-in the files prove missing blocks a run.
      return "unknown";
    default:
      // A method this version of Slopify doesn't know.
      return "unknown";
  }
}

function parse(text: string | undefined): Record<string, unknown> | undefined {
  if (text === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function selectedAuth(settings: Record<string, unknown> | undefined): string | undefined {
  const security = settings?.security;
  const auth =
    typeof security === "object" && security !== null
      ? (security as Record<string, unknown>).auth
      : undefined;
  const nested =
    typeof auth === "object" && auth !== null
      ? (auth as Record<string, unknown>).selectedType
      : undefined;
  if (typeof nested === "string" && nested !== "") return nested;
  const flat = settings?.selectedAuthType;
  return typeof flat === "string" && flat !== "" ? flat : undefined;
}

function nonEmpty(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== "";
}

// `NAME=value` in a .env file, optionally quoted or exported.
function dotenvHas(text: string | undefined, name: string): boolean {
  if (text === undefined) return false;
  return text.split(/\r?\n/).some((line) => {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    return match?.[1] === name && nonEmpty((match[2] ?? "").replace(/^["']|["']$/g, ""));
  });
}
