import { execFile } from "node:child_process";
import { mkdir, readFile, rename, rmdir, unlink, writeFile } from "node:fs/promises";
import { posix, win32 } from "node:path";
import {
  type AutostartPlatform,
  agentLabel,
  cmdLauncher,
  desktopEntry,
  desktopExecArg,
  desktopMarker,
  type LaunchSpec,
  launchAgent,
  launcherMarker,
  runKey,
  runValue,
  shellLauncher,
  windowsPathProblem,
  windowsRunCommand,
  xmlText,
} from "./launcher.js";

// The disk and the commands "Start Slopify when I log in" uses; tests hand in fakes.
export interface AutostartFs {
  // The file's text, or undefined when it doesn't exist.
  read(path: string): Promise<string | undefined>;
  // Writes the whole file (through a temporary file), creating its folder.
  write(path: string, text: string, mode: number): Promise<void>;
  // Deletes the file; a missing one is fine.
  remove(path: string): Promise<void>;
  // Deletes the folder when it is empty; a missing or non-empty one is left alone.
  removeEmptyDir(path: string): Promise<void>;
}
export interface ExecResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}
export type AutostartExec = (file: string, args: readonly string[]) => Promise<ExecResult>;

export interface NativeAutostartOptions extends Omit<LaunchSpec, "platform"> {
  readonly platform: NodeJS.Platform;
  readonly home: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly wsl: boolean;
  readonly fs: AutostartFs;
  readonly exec: AutostartExec;
}

export interface NativeState {
  readonly available: boolean;
  readonly enabled: boolean;
  readonly where: string | null;
  readonly summary: string;
}

export interface NativeAutostart {
  status(): Promise<NativeState>;
  enable(): Promise<NativeState>;
  disable(): Promise<NativeState>;
  // Rewrites the launcher and the entry when the switch is on, so they follow the Node, the
  // installed entry and the version in use. Does nothing when it is off.
  refresh(): Promise<void>;
}

const launcherDir = "autostart";

// How each entry spells the launcher's path.
function launcherRef(platform: AutostartPlatform, launcher: string): string {
  return platform === "linux"
    ? desktopExecArg(launcher)
    : platform === "darwin"
      ? xmlText(launcher)
      : launcher;
}

// Where each platform keeps the per-user login entry. None of them needs administrator
// rights, and none is a systemd unit: a desktop login starts them.
function locations(o: NativeAutostartOptions, platform: AutostartPlatform) {
  const path = platform === "win32" ? win32 : posix;
  const dir = path.join(o.dataDir, launcherDir);
  const launcher = path.join(dir, platform === "win32" ? "start-slopify.cmd" : "start-slopify.sh");
  const configHome =
    o.env.XDG_CONFIG_HOME && posix.isAbsolute(o.env.XDG_CONFIG_HOME)
      ? o.env.XDG_CONFIG_HOME
      : posix.join(o.home, ".config");
  const entry =
    platform === "linux"
      ? posix.join(configHome, "autostart", "slopify.desktop")
      : platform === "darwin"
        ? posix.join(o.home, "Library", "LaunchAgents", `${agentLabel}.plist`)
        : null;
  return {
    dir,
    launcher,
    entry,
    where: entry ?? `${runKey} → ${runValue}`,
  };
}

function supported(o: NativeAutostartOptions): AutostartPlatform | string {
  if (o.wsl)
    return "Slopify runs inside WSL here, and Windows doesn't start Linux programs when you log in. Start Slopify from a Windows terminal instead (npx @gentbajko/slopify), then turn this switch on there.";
  if (o.platform === "linux" || o.platform === "darwin" || o.platform === "win32")
    return o.platform;
  return `Starting at login isn't supported on ${o.platform}. Start Slopify yourself with npx @gentbajko/slopify.`;
}

export function createNativeAutostart(o: NativeAutostartOptions): NativeAutostart {
  const platform = supported(o);
  if (platform !== "linux" && platform !== "darwin" && platform !== "win32") {
    const off: NativeState = { available: false, enabled: false, where: null, summary: platform };
    return {
      status: async () => off,
      enable: () => Promise.reject(new Error(platform)),
      disable: async () => off,
      refresh: async () => {},
    };
  }
  const at = locations(o, platform);
  const spec: LaunchSpec = { ...o, platform };
  const launcherText = platform === "win32" ? cmdLauncher(spec) : shellLauncher(spec);
  const entryText =
    platform === "linux"
      ? desktopEntry(at.launcher)
      : platform === "darwin"
        ? launchAgent(at.launcher, o.log)
        : windowsRunCommand(at.launcher);

  // The entry as it is now: absent, Slopify's (with its current text), or someone else's.
  async function entryNow(): Promise<{ state: "none" | "ours" | "foreign"; text?: string }> {
    if (platform === "win32") {
      const result = await o.exec("reg", ["query", runKey, "/v", runValue]);
      if (result.code !== 0) return { state: "none" };
      const data = /REG_(?:EXPAND_)?SZ\s+(.*)$/mu.exec(result.stdout)?.[1]?.trim();
      if (data === undefined) return { state: "foreign" };
      return data.includes("start-slopify.cmd")
        ? { state: "ours", text: data }
        : { state: "foreign", text: data };
    }
    const text = await o.fs.read(at.entry as string);
    if (text === undefined) return { state: "none" };
    const ours = text.includes(platform === "linux" ? desktopMarker : launcherMarker);
    return { state: ours ? "ours" : "foreign", text };
  }

  function state(enabled: boolean): NativeState {
    return {
      available: true,
      enabled,
      where: at.where,
      summary: enabled
        ? "Slopify starts quietly when you log in to this computer, without opening a browser tab."
        : "Slopify starts only when you start it.",
    };
  }

  async function writeLauncher(): Promise<void> {
    if ((await o.fs.read(at.launcher)) !== launcherText)
      await o.fs.write(at.launcher, launcherText, 0o700);
  }

  async function writeEntry(current: string | undefined): Promise<void> {
    if (current === entryText) return;
    if (platform === "win32") {
      const result = await o.exec("reg", [
        "add",
        runKey,
        "/v",
        runValue,
        "/t",
        "REG_SZ",
        "/d",
        entryText,
        "/f",
      ]);
      if (result.code !== 0)
        throw new Error(
          `Windows refused to add Slopify to the programs that start when you log in (reg add ${runKey}: ${result.stderr.trim() || `exit code ${result.code}`}). Nothing needs administrator rights here, so try the switch again; if it keeps failing, check that a security program isn't blocking changes to your start-up list.`,
        );
      return;
    }
    await o.fs.write(at.entry as string, entryText, 0o644);
  }

  return {
    status: async () => state((await entryNow()).state === "ours"),
    enable: async () => {
      if (platform === "win32") {
        const problem = windowsPathProblem(o.dataDir);
        if (problem !== undefined) throw new Error(problem);
      }
      const now = await entryNow();
      if (now.state === "foreign")
        throw new Error(
          platform === "win32"
            ? `Your start-up list already has an entry named ${runValue} that Slopify didn't make (${runKey}). Slopify left it alone. Remove it in Task Manager → Startup apps, or rename it, then turn the switch on again.`
            : `${at.entry} already exists and wasn't made by Slopify, so Slopify left it alone. Delete or rename that file, then turn the switch on again.`,
        );
      await writeLauncher();
      await writeEntry(now.text);
      return state(true);
    },
    disable: async () => {
      const now = await entryNow();
      if (now.state === "ours") {
        if (platform === "win32") {
          const result = await o.exec("reg", ["delete", runKey, "/v", runValue, "/f"]);
          if (result.code !== 0)
            throw new Error(
              `Windows refused to remove Slopify from the programs that start when you log in (reg delete ${runKey}: ${result.stderr.trim() || `exit code ${result.code}`}). Turn it off in Task Manager → Startup apps → Slopify instead.`,
            );
        } else await o.fs.remove(at.entry as string);
      }
      // The launcher is only ever Slopify's own; a hand-edited one without the marker stays.
      const launcher = await o.fs.read(at.launcher);
      if (launcher?.includes(launcherMarker)) await o.fs.remove(at.launcher);
      await o.fs.removeEmptyDir(at.dir);
      return state(false);
    },
    refresh: async () => {
      const now = await entryNow();
      // Only the entry that runs this data folder's launcher: a Slopify started with another
      // --data-dir must not take over the one the switch was turned on from.
      if (now.state !== "ours" || !now.text?.includes(launcherRef(platform, at.launcher))) return;
      await writeLauncher();
      await writeEntry(now.text);
    },
  };
}

export const nodeAutostartFs: AutostartFs = {
  read: async (path) => {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
  },
  write: async (path, text, mode) => {
    const directory = path.slice(0, Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")));
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, text, { mode });
    await rename(temporary, path);
  },
  remove: async (path) => {
    try {
      await unlink(path);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  },
  removeEmptyDir: async (path) => {
    try {
      await rmdir(path);
    } catch {
      // Missing, or holds something else: either way it stays as it is.
    }
  },
};

export const nodeAutostartExec: AutostartExec = (file, args) =>
  new Promise((resolve) => {
    execFile(
      file,
      [...args],
      { windowsHide: true, timeout: 15_000, encoding: "utf8" },
      (error, stdout, stderr) => {
        const code =
          error === null
            ? 0
            : typeof error.code === "number"
              ? error.code
              : // A missing command (ENOENT) or a timeout: no exit code of its own.
                127;
        resolve({ code, stdout, stderr: stderr || (error?.message ?? "") });
      },
    );
  });

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
