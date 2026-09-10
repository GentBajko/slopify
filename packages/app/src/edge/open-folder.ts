import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isWsl } from "./open-browser.js";

const execute = promisify(execFile);

export function folderCommand(
  platform: NodeJS.Platform,
  path: string,
  wsl = false,
): [string, string[]] {
  if (platform === "win32" || wsl) return ["explorer.exe", [path]];
  return [platform === "darwin" ? "open" : "xdg-open", [path]];
}

export async function openFolder(path: string): Promise<void> {
  const wsl = isWsl(process.platform);
  const target = wsl
    ? (await execute("wslpath", ["-w", path], { timeout: 5000 })).stdout.trim()
    : path;
  const [command, args] = folderCommand(process.platform, target, wsl);
  try {
    await execute(command, args, { timeout: 10000 });
  } catch (error) {
    // Explorer commonly reports 1 even when it successfully opens an existing window.
    if (command === "explorer.exe" && error instanceof Error && "code" in error && error.code === 1)
      return;
    throw error;
  }
}
