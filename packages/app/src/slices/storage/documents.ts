import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, posix, relative, resolve, win32 } from "node:path";
import { promisify } from "node:util";

// What finding the Documents folder needs from the machine, handed in so a test can play any
// system without touching the real one.
export interface DocumentsHost {
  readonly platform: NodeJS.Platform;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly home: string;
  // Runs a program and returns its standard output; rejects when it fails or is missing.
  readonly run: (command: string, args: readonly string[]) => Promise<string>;
  // A text file's contents, or undefined when it can't be read.
  readonly read: (path: string) => Promise<string | undefined>;
}

const execute = promisify(execFile);

export function nodeDocumentsHost(): DocumentsHost {
  return {
    platform: process.platform,
    env: process.env,
    home: homedir(),
    run: async (command, args) =>
      (await execute(command, [...args], { timeout: 10_000, windowsHide: true })).stdout,
    read: (path) => readFile(path, "utf8").catch(() => undefined),
  };
}

// The user's own Documents folder, the way the system itself names it: Windows asks for the
// known folder (which follows OneDrive and a folder moved in its Properties), Linux asks
// xdg-user-dir and then reads user-dirs.dirs, macOS has no setting for it. Never throws: the
// fallback is <home>/Documents. It isn't created here.
export async function documentsDir(host: DocumentsHost): Promise<string> {
  if (host.platform === "win32") {
    const known = await host
      .run("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "[Environment]::GetFolderPath('MyDocuments')",
      ])
      .then((out) => out.trim())
      .catch(() => "");
    if (usable(known, host.home, true)) return known;
    return win32.join(host.env.USERPROFILE?.trim() || host.home, "Documents");
  }
  const fallback = posix.join(host.home, "Documents");
  if (host.platform === "darwin") return fallback;
  const asked = await host
    .run("xdg-user-dir", ["DOCUMENTS"])
    .then((out) => out.trim())
    .catch(() => "");
  if (usable(asked, host.home)) return resolve(asked);
  const configHome = host.env.XDG_CONFIG_HOME?.trim() || join(host.home, ".config");
  const configured = userDirsDocuments(
    (await host.read(join(configHome, "user-dirs.dirs"))) ?? "",
    host.home,
  );
  if (configured !== undefined && usable(configured, host.home)) return resolve(configured);
  return fallback;
}

// XDG_DOCUMENTS_DIR from a user-dirs.dirs file: `XDG_DOCUMENTS_DIR="$HOME/Documents"`. The
// format allows only $HOME at the start or an absolute path.
export function userDirsDocuments(text: string, home: string): string | undefined {
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*XDG_DOCUMENTS_DIR\s*=\s*"([^"]*)"\s*$/.exec(line);
    if (match === null) continue;
    const value = match[1] ?? "";
    if (value === "$HOME" || value.startsWith("$HOME/"))
      return join(home, value.slice("$HOME".length));
    if (isAbsolute(value)) return value;
    return undefined;
  }
  return undefined;
}

// xdg-user-dir answers with the home folder itself when Documents isn't set (the spec's "not
// configured" value); a Documents folder that is the home folder would mix Slopify's folder
// with everything else, so that counts as unset too.
function usable(path: string, home: string, windows = false): boolean {
  if (path === "") return false;
  if (!windows && !isAbsolute(path)) return false;
  if (windows && !/^(?:[a-zA-Z]:[\\/]|\\\\)/.test(path)) return false;
  if (windows) return win32.relative(win32.resolve(home), win32.resolve(path)) !== "";
  return relative(resolve(home), resolve(path)) !== "";
}
