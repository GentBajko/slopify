import { execFile } from "node:child_process";
import { cliCommand } from "../../kernel/cli-command.js";
import type { CliProvider, Readiness } from "./model.js";

// What a probe learned. "Did not run" covers every way a binary can fail to answer -
// absent from PATH, non-zero exit, killed on the timeout - because all of them mean the
// same thing to the user: the provider is not usable.
export interface CliProbeResult {
  readonly ran: boolean;
  readonly stdout: string;
  readonly error?: string;
}

export type CliProbe = (
  binary: string,
  args: readonly string[],
  timeoutMs: number,
) => Promise<CliProbeResult>;

// Gemini's Node startup can take several seconds on Windows. Providers are probed in
// parallel; a hung process is bounded without treating ordinary startup as missing.
export const cliProbeTimeoutMs = 15_000;
const probeOutputMax = 64 * 1024;

// Known Windows package-manager shims are resolved to an executable plus fixed args;
// user input never becomes a shell command. Missing/unsupported commands mean not ready.
export function nodeCliProbe(
  binary: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<CliProbeResult> {
  let command: ReturnType<typeof cliCommand>;
  try {
    command = cliCommand(binary);
  } catch (error) {
    return Promise.resolve({
      ran: false,
      stdout: "",
      error: error instanceof Error ? error.message : "The CLI launcher could not be resolved.",
    });
  }
  return new Promise<CliProbeResult>((resolve) => {
    execFile(
      command.file,
      [...command.args, ...args],
      { timeout: timeoutMs, maxBuffer: probeOutputMax, windowsHide: true },
      (error, stdout) => {
        resolve(error === null ? { ran: true, stdout } : { ran: false, stdout: "" });
      },
    );
  });
}

export async function cliReadiness(probe: CliProbe, provider: CliProvider): Promise<Readiness> {
  return readinessFromProbe(await probe(provider.binary, provider.versionArgs, cliProbeTimeoutMs));
}

export function readinessFromProbe(result: CliProbeResult): Readiness {
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
