import { readFileSync, statSync } from "node:fs";
import { extname, isAbsolute, join, resolve, win32 } from "node:path";

export interface CliCommand {
  readonly file: string;
  readonly args: readonly string[];
}

// Keep prompts out of cmd.exe: npm launchers name a JavaScript entry point that
// Node can execute directly with an argv array, including quotes and newlines.
export function cliCommand(binary: string): CliCommand {
  const file = process.platform === "win32" ? windowsFile(binary) : binary;
  if (/\.[cm]?js$/i.test(file)) return { file: process.execPath, args: [resolve(file)] };
  if (process.platform !== "win32" || !/\.(cmd|bat)$/i.test(file)) return { file, args: [] };
  const stat = statSync(file);
  if (!stat.isFile() || stat.size > 64 * 1024) throw unsupportedShim();
  const target = windowsShimTarget(file, readFileSync(file, "utf8"));
  if (target === undefined || !statSync(target, { throwIfNoEntry: false })?.isFile())
    throw unsupportedShim();
  return { file: process.execPath, args: [target] };
}

export function windowsShimTarget(file: string, source: string): string | undefined {
  if (!/(?:node|bun)(?:\.exe)?/i.test(source)) return undefined;
  // npm's cmd-shim uses %dp0%, older launchers use %~dp0. The remainder must
  // be a literal relative script path, followed by the original argument list.
  const matched = /"(?:%dp0%|%~dp0)[\\/]?([^"%\r\n]+\.[cm]?js)"\s+%\*/i.exec(source);
  if (matched?.[1] === undefined || win32.isAbsolute(matched[1])) return undefined;
  return win32.resolve(win32.dirname(file), matched[1]);
}

function windowsFile(binary: string): string {
  const path = Object.entries(process.env).find(([key]) => key.toLowerCase() === "path")?.[1] ?? "";
  const directories = isAbsolute(binary) || /[\\/]/.test(binary) ? [""] : path.split(";");
  const suffixes = extname(binary) === "" ? [".exe", ".com", ".cmd", ".bat", ""] : [""];
  for (const directory of directories) {
    for (const suffix of suffixes) {
      const file =
        directory === "" ? binary + suffix : join(directory.replace(/^"|"$/g, ""), binary + suffix);
      if (statSync(file, { throwIfNoEntry: false })?.isFile()) return resolve(file);
    }
  }
  // Let spawn report its usual ENOENT when no executable exists.
  return binary;
}

function unsupportedShim(): Error {
  return new Error(
    "This batch launcher is not a supported Node CLI shim. Select the CLI's .exe or JavaScript entry file instead.",
  );
}
