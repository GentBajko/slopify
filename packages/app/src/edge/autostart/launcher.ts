// The files "Start Slopify when I log in" writes, as pure text. Nothing here touches the disk,
// so every platform's output is tested on any machine (`launcher.test.ts`).
//
// The login entry never names the npx cache: npx may clean it or move it on its next run. It
// runs a small launcher kept in the data folder instead, which starts, in order:
//   1. the installed Slopify entry, when Slopify runs from a real install (npm i -g, a local
//      checkout), not from the npx cache;
//   2. npx's own script next to this Node, asking for the version that was running when the
//      switch was turned on (`@gentbajko/slopify@<version>`), so a login works offline once
//      that version is in the cache and never jumps to a new release by itself;
//   3. plain `npx` from PATH, the same way.
// In-app updates still apply: the started version forwards to the newest one installed in the
// data folder (`updater/forward.ts`). Each start with the switch on writes the launcher again,
// so it follows the Node, the entry and the version actually in use.

export type AutostartPlatform = "linux" | "darwin" | "win32";

export interface LaunchSpec {
  readonly platform: AutostartPlatform;
  // The Node that runs Slopify now (process.execPath).
  readonly node: string;
  // The installed cli.js, or null when Slopify runs from the npx cache.
  readonly entry: string | null;
  // npm's npx-cli.js beside that Node, or null when it isn't there.
  readonly npxCli: string | null;
  readonly version: string;
  readonly dataDir: string;
  readonly port: number;
  readonly host: string;
  // Where the launcher appends the output of a login start.
  readonly log: string;
}

export const packageName = "@gentbajko/slopify";
export const launcherMarker = "Written by Slopify: Settings";
export const desktopMarker = "X-Slopify-Autostart=true";
export const agentLabel = "stream.slopify.app";
export const runKey = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
export const runValue = "Slopify";

// The flags a login start runs with: quiet (no browser tab), and the data folder, port and
// host of the Slopify that turned the switch on, since no terminal is there to pass them.
export function launchArgs(spec: LaunchSpec): readonly string[] {
  return [
    "--no-open",
    "--data-dir",
    spec.dataDir,
    "--port",
    String(spec.port),
    ...(spec.host === "127.0.0.1" ? [] : ["--host", spec.host]),
  ];
}

// POSIX sh single quotes: nothing inside is special except the quote itself.
export function shQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function shellLauncher(spec: LaunchSpec): string {
  const args = launchArgs(spec).map(shQuote).join(" ");
  const pkg = shQuote(`${packageName}@${spec.version}`);
  const lines = [
    "#!/bin/sh",
    "# Starts Slopify quietly when you log in: no browser tab, open it from your bookmark.",
    `# ${launcherMarker} → General → "Start Slopify when I log in".`,
    "# Turning that switch off deletes this file and the login entry that runs it.",
    `exec >>${shQuote(spec.log)} 2>&1`,
    `echo "$(date) Starting Slopify at login"`,
    `NODE=${shQuote(spec.node)}`,
    '[ -x "$NODE" ] || NODE=$(command -v node) || {',
    `  echo "Slopify could not start at login: Node.js was not found. Install Node.js from https://nodejs.org, then start Slopify once with npx ${packageName}."`,
    "  exit 1",
    "}",
    'PATH=$(dirname "$NODE"):$PATH',
    "export PATH",
  ];
  if (spec.entry !== null)
    lines.push(
      `if [ -f ${shQuote(spec.entry)} ]; then exec "$NODE" ${shQuote(spec.entry)} ${args}; fi`,
    );
  if (spec.npxCli !== null)
    lines.push(
      `if [ -f ${shQuote(spec.npxCli)} ]; then exec "$NODE" ${shQuote(spec.npxCli)} --yes ${pkg} ${args}; fi`,
    );
  lines.push(`exec npx --yes ${pkg} ${args}`, "");
  return lines.join("\n");
}

// cmd.exe: inside double quotes only `%` still expands, so it is doubled. A path can't hold a
// double quote on Windows, and `windowsPathProblem` refuses the rest before anything is written.
function cmdQuote(value: string): string {
  return `"${value.replaceAll("%", "%%")}"`;
}

export function cmdLauncher(spec: LaunchSpec): string {
  const args = launchArgs(spec)
    .map((arg) => (/^[\w.:-]+$/u.test(arg) ? arg : cmdQuote(arg)))
    .join(" ");
  const pkg = `${packageName}@${spec.version}`;
  const log = `>>${cmdQuote(spec.log)} 2>&1`;
  const nodeDir = spec.node.slice(0, Math.max(spec.node.lastIndexOf("\\"), 0));
  const lines = [
    "@echo off",
    "rem Starts Slopify quietly when you log in: no browser tab, open it from your bookmark.",
    `rem ${launcherMarker} > General > "Start Slopify when I log in".`,
    "rem Turning that switch off deletes this file and the login entry that runs it.",
    "rem Closing this window stops Slopify.",
    "chcp 65001 >nul",
    "title Slopify",
    `set "NODE=${spec.node.replaceAll("%", "%%")}"`,
    `set "PATH=${nodeDir.replaceAll("%", "%%")};%PATH%"`,
    'if not exist "%NODE%" set "NODE=node"',
  ];
  if (spec.entry !== null)
    lines.push(
      `if not exist ${cmdQuote(spec.entry)} goto npxcli`,
      `"%NODE%" ${cmdQuote(spec.entry)} ${args} ${log}`,
      "exit /b",
    );
  lines.push(":npxcli");
  if (spec.npxCli !== null)
    lines.push(
      `if not exist ${cmdQuote(spec.npxCli)} goto npx`,
      `"%NODE%" ${cmdQuote(spec.npxCli)} --yes ${pkg} ${args} ${log}`,
      "exit /b",
    );
  lines.push(":npx", `call npx --yes ${pkg} ${args} ${log}`, "");
  return lines.join("\r\n");
}

// The registry's Run value: a minimised console running the launcher, so a login shows a
// taskbar button named Slopify rather than a window in the way. REG_SZ doesn't expand
// variables, and `start` takes the first quoted argument as the window title.
export function windowsRunCommand(launcher: string): string {
  return `cmd.exe /d /c start "Slopify" /min "${launcher}"`;
}

// Characters cmd.exe would read as its own inside the Run value (`%` expands even in quotes
// there, where a batch file's `%%` doesn't apply). Windows paths can't contain `"`.
export function windowsPathProblem(path: string): string | undefined {
  return /[%"\r\n]/u.test(path)
    ? `The Slopify data folder ${path} contains a % sign, which Windows' start-up list can't run. Start Slopify with another folder (npx ${packageName} --data-dir C:\\Slopify) and turn the switch on there.`
    : undefined;
}

// Desktop Entry spec: an argument with spaces or reserved characters is double-quoted, with
// `"`, `` ` ``, `$` and `\` backslash-escaped inside; the value as a whole then escapes `\`
// again, and `%` is a field code unless doubled.
export function desktopExecArg(value: string): string {
  if (/^[A-Za-z0-9_./+,:@=-]+$/u.test(value)) return value;
  const quoted = `"${value.replace(/["`$\\]/gu, (char) => `\\${char}`)}"`;
  return quoted.replaceAll("\\", "\\\\").replaceAll("%", "%%");
}

// Freedesktop keys escape newlines, tabs and backslashes in plain string values.
function desktopString(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll("\t", "\\t")
    .replaceAll("\r", "\\r");
}

export function desktopEntry(launcher: string): string {
  return [
    "[Desktop Entry]",
    "Type=Application",
    "Name=Slopify",
    desktopString(
      `Comment=Starts Slopify quietly when you log in. Turn it off in Slopify: Settings → General.`,
    ),
    `Exec=/bin/sh ${desktopExecArg(launcher)}`,
    "Terminal=false",
    "NoDisplay=true",
    "Hidden=false",
    "X-GNOME-Autostart-enabled=true",
    desktopMarker,
    "",
  ].join("\n");
}

export function xmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// A per-user LaunchAgent: launchd loads every agent in ~/Library/LaunchAgents at login and
// RunAtLoad starts it once. No KeepAlive, so quitting Slopify keeps it quit until next login.
export function launchAgent(launcher: string, log: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    `<!-- ${launcherMarker} → General → "Start Slopify when I log in". -->`,
    '<plist version="1.0">',
    "<dict>",
    "  <key>Label</key>",
    `  <string>${agentLabel}</string>`,
    "  <key>ProgramArguments</key>",
    "  <array>",
    "    <string>/bin/sh</string>",
    `    <string>${xmlText(launcher)}</string>`,
    "  </array>",
    "  <key>RunAtLoad</key>",
    "  <true/>",
    "  <key>KeepAlive</key>",
    "  <false/>",
    "  <key>ProcessType</key>",
    "  <string>Interactive</string>",
    "  <key>StandardOutPath</key>",
    `  <string>${xmlText(log)}</string>`,
    "  <key>StandardErrorPath</key>",
    `  <string>${xmlText(log)}</string>`,
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}
