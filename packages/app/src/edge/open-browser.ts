import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

// WSL reports itself as linux, so the browser it opens is one inside the distribution -
// usually none at all - rather than the Windows browser the user is actually looking at.
// The kernel string is the reliable marker: the environment variables below are absent
// under `sudo` and in a login shell started by a service, but /proc/version always says.
export function isWsl(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv = process.env,
  kernel: () => string = readKernel,
): boolean {
  if (platform !== "linux") {
    return false;
  }
  if (env.WSL_DISTRO_NAME !== undefined || env.WSL_INTEROP !== undefined) {
    return true;
  }
  // Guarded here rather than in the reader: whatever is injected, a browser that does not
  // open is a nuisance and must not be able to fail the boot.
  try {
    return /microsoft|wsl/i.test(kernel());
  } catch {
    return false;
  }
}

function readKernel(): string {
  return readFileSync("/proc/version", "utf8");
}

export function browserCommand(
  platform: NodeJS.Platform,
  url: string,
  wsl = false,
): [string, readonly string[]] {
  if (platform === "darwin") {
    return ["open", [url]];
  }
  if (platform === "win32") {
    // `start` is a cmd builtin, and its first quoted argument is the window title.
    return ["cmd", ["/c", "start", "", url]];
  }
  if (wsl) {
    // The same builtin, reached across the interop boundary, so the URL opens in the
    // Windows default browser. `.exe` is required from the linux side. cmd complains about
    // the linux working directory on stderr, which is already discarded.
    return ["cmd.exe", ["/c", "start", "", url]];
  }
  return ["xdg-open", [url]];
}

export function openBrowser(url: string, warn: (message: string) => void): void {
  const [command, args] = browserCommand(process.platform, url, isWsl(process.platform));
  const child = spawn(command, [...args], { stdio: "ignore", detached: true });
  // No browser is a nuisance, not a failure: the URL is already on the terminal.
  child.on("error", (error: Error) => {
    warn(`Could not open a browser (${error.message}). Open ${url} yourself.`);
  });
  child.unref();
}
