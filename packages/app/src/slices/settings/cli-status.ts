import { execFile } from "node:child_process";
import type { CliProvider, Readiness } from "./model.js";

// What a probe learned. "Did not run" covers every way a binary can fail to answer -
// absent from PATH, non-zero exit, killed on the timeout - because all of them mean the
// same thing to the user: the provider is not usable (`logic/02` §Q135).
export interface CliProbeResult {
  readonly ran: boolean;
  readonly stdout: string;
}

export type CliProbe = (
  binary: string,
  args: readonly string[],
  timeoutMs: number,
) => Promise<CliProbeResult>;

// ceiling: `logic/02` §Q135 computes readiness at request time, so nothing is cached and
// a hung CLI costs the settings page this long. Both probes run in parallel, so the page
// waits 2 s in the worst case. Caching the answer for a few seconds is the upgrade if a
// slow machine makes the status line flap.
export const cliProbeTimeoutMs = 2000;
const probeOutputMax = 64 * 1024;

// The real probe: an argument array, never a shell string, so nothing in a binary name
// or an argument can be interpreted as a command. It resolves for every outcome; a
// missing CLI is an answer, not a failure.
// ceiling: POSIX only. A Windows install puts `claude` on PATH as a `.cmd` shim, which
// execFile cannot run without a shell; a shim-aware lookup is the upgrade when Windows
// is supported.
export function nodeCliProbe(
  binary: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<CliProbeResult> {
  return new Promise<CliProbeResult>((resolve) => {
    execFile(
      binary,
      [...args],
      { timeout: timeoutMs, maxBuffer: probeOutputMax, windowsHide: true },
      (error, stdout) => {
        resolve(error === null ? { ran: true, stdout } : { ran: false, stdout: "" });
      },
    );
  });
}

export async function cliReadiness(probe: CliProbe, provider: CliProvider): Promise<Readiness> {
  const result = await probe(provider.binary, provider.versionArgs, cliProbeTimeoutMs);
  if (!result.ran) {
    return { kind: "cli", installed: false };
  }
  const version = versionFrom(result.stdout);
  return version === undefined
    ? { kind: "cli", installed: true }
    : { kind: "cli", installed: true, version };
}

// `claude --version` answers "2.1.258 (Claude Code)" and `codex --version` answers
// "codex-cli 0.149.1", so the version is the first dotted number on the output rather
// than the whole line either of them prints.
export function versionFrom(stdout: string): string | undefined {
  const match = /\d+\.\d+(?:\.[0-9A-Za-z.+-]+)?/.exec(stdout);
  return match?.[0];
}
