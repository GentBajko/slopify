import { spawn } from "node:child_process";

export function browserCommand(
  platform: NodeJS.Platform,
  url: string,
): [string, readonly string[]] {
  if (platform === "darwin") {
    return ["open", [url]];
  }
  if (platform === "win32") {
    // `start` is a cmd builtin, and its first quoted argument is the window title.
    return ["cmd", ["/c", "start", "", url]];
  }
  return ["xdg-open", [url]];
}

export function openBrowser(url: string, warn: (message: string) => void): void {
  const [command, args] = browserCommand(process.platform, url);
  const child = spawn(command, [...args], { stdio: "ignore", detached: true });
  // No browser is a nuisance, not a failure: the URL is already on the terminal.
  child.on("error", (error: Error) => {
    warn(`Could not open a browser (${error.message}). Open ${url} yourself.`);
  });
  child.unref();
}
