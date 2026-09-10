import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cliCommand, windowsShimTarget } from "./cli-command.js";

describe("CLI launch commands", () => {
  it("unwraps npm shims without handing arguments to a shell", () => {
    expect(
      windowsShimTarget(
        String.raw`C:\Users\Test User\AppData\Roaming\npm\gemini.cmd`,
        String.raw`@IF EXIST "%dp0%\node.exe" SET "_prog=%dp0%\node.exe"
"%_prog%" "%dp0%\node_modules\@google\gemini-cli\dist\index.js" %*`,
      ),
    ).toBe(
      String.raw`C:\Users\Test User\AppData\Roaming\npm\node_modules\@google\gemini-cli\dist\index.js`,
    );
  });
  it("recognizes older node batch shims and refuses arbitrary commands", () => {
    expect(
      windowsShimTarget(String.raw`C:\tools\gemini.bat`, String.raw`node "%~dp0\gemini.cjs" %*`),
    ).toBe(String.raw`C:\tools\gemini.cjs`);
    expect(
      windowsShimTarget(String.raw`C:\tools\gemini.cmd`, String.raw`bun "%~dp0\gemini.js" %*`),
    ).toBe(String.raw`C:\tools\gemini.js`);
    expect(
      windowsShimTarget(String.raw`C:\tools\custom.cmd`, "@echo off\npowershell custom.ps1 %*"),
    ).toBeUndefined();
  });
  it("uses Node for an explicit script entry and keeps native executables direct", () => {
    const dir = mkdtempSync(join(tmpdir(), "slopify-command-"));
    const script = join(dir, "entry with spaces.mjs");
    writeFileSync(script, "");
    expect(cliCommand(script)).toEqual({ file: process.execPath, args: [script] });
    expect(cliCommand(process.execPath)).toEqual({ file: process.execPath, args: [] });
  });
});
