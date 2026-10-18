import { execFile } from "node:child_process";

export interface TailscaleResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
  // The tailscale command isn't on this computer.
  readonly missing: boolean;
  readonly timedOut: boolean;
}

// Runs one of the commands below and never throws for the command's own failure.
export type TailscaleRun = (args: readonly string[]) => Promise<TailscaleResult>;

// Every command Slopify sends. Serve only: Funnel puts an address on the public internet, and
// Slopify has no login and holds API keys, so no path through Slopify may ever reach it.
export const tailscaleCommands = {
  status: () => ["status", "--json"],
  serveStatus: () => ["serve", "status", "--json"],
  serveOn: (httpsPort: number, target: string) => [
    "serve",
    "--bg",
    "--yes",
    `--https=${httpsPort}`,
    target,
  ],
  serveOff: (httpsPort: number) => ["serve", "--yes", `--https=${httpsPort}`, "off"],
} as const;

const allowed = new Set(["status", "serve"]);

// The last line of defence: a command that names Funnel, or isn't one of the above, never runs.
export function assertServeOnly(args: readonly string[]): void {
  const [command] = args;
  if (command === undefined || !allowed.has(command))
    throw new Error(`Slopify only runs tailscale status and tailscale serve, not "${command}".`);
  if (args.some((arg) => /funnel/iu.test(arg)))
    throw new Error("Slopify never turns on Tailscale Funnel.");
}

export function guarded(run: TailscaleRun): TailscaleRun {
  return async (args) => {
    assertServeOnly(args);
    return run(args);
  };
}

// Where the command is when it isn't on PATH: the macOS app bundle and the Windows installer.
export function tailscaleCandidates(platform: NodeJS.Platform): readonly string[] {
  if (platform === "darwin")
    return ["tailscale", "/Applications/Tailscale.app/Contents/MacOS/Tailscale"];
  if (platform === "win32") return ["tailscale", "C:\\Program Files\\Tailscale\\tailscale.exe"];
  return ["tailscale"];
}

function execOnce(file: string, args: readonly string[], timeoutMs: number) {
  return new Promise<TailscaleResult>((resolve) => {
    execFile(
      file,
      [...args],
      { windowsHide: true, timeout: timeoutMs, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ code: 0, stdout, stderr, missing: false, timedOut: false });
          return;
        }
        const missing = error.code === "ENOENT";
        const timedOut = error.killed === true && error.signal !== null;
        resolve({
          code: typeof error.code === "number" ? error.code : 1,
          stdout,
          stderr: stderr || error.message,
          missing,
          timedOut,
        });
      },
    );
  });
}

// ceiling: a status or serve call answers within a second on a healthy machine; a hung
// daemon must not hold a request, so each call is cut off.
export function nodeTailscaleRun(platform: NodeJS.Platform, timeoutMs = 10_000): TailscaleRun {
  const candidates = tailscaleCandidates(platform);
  return guarded(async (args) => {
    let last: TailscaleResult | undefined;
    for (const file of candidates) {
      last = await execOnce(file, args, timeoutMs);
      if (!last.missing) return last;
    }
    return last ?? { code: 127, stdout: "", stderr: "", missing: true, timedOut: false };
  });
}
