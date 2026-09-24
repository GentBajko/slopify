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
// The content adapter's isolation flags and feature gates were verified against this release.
// Older Codex binaries must fail before admission instead of failing every generation attempt.
export const minimumCodexCliVersion = "0.149.1";
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
  return readinessFromProbe(
    await probe(provider.binary, provider.versionArgs, cliProbeTimeoutMs),
    provider,
  );
}

export function readinessFromProbe(result: CliProbeResult, provider: CliProvider): Readiness {
  if (!result.ran) {
    return { kind: "cli", installed: false };
  }
  const version = versionFrom(result.stdout);
  if (provider.id !== "codex" && provider.id !== "codex-image")
    return version === undefined
      ? { kind: "cli", installed: true }
      : { kind: "cli", installed: true, version };
  if (version === undefined)
    return {
      kind: "cli",
      installed: true,
      issue: `Slopify could not verify this Codex CLI version. Install Codex CLI ${minimumCodexCliVersion} or newer, then try again.`,
    };
  if (!versionAtLeast(version, minimumCodexCliVersion))
    return {
      kind: "cli",
      installed: true,
      version,
      issue: `Codex CLI ${minimumCodexCliVersion} or newer is required; version ${version} is installed. Update Codex CLI and try again.`,
    };
  return { kind: "cli", installed: true, version };
}

function versionAtLeast(version: string, minimum: string): boolean {
  const candidate = comparableVersion(version);
  const floor = comparableVersion(minimum);
  if (candidate === undefined || floor === undefined) return false;
  for (let index = 0; index < 3; index++) {
    const current = candidate.parts[index] ?? 0n;
    const required = floor.parts[index] ?? 0n;
    if (current !== required) return current > required;
  }
  return !(candidate.prerelease && !floor.prerelease);
}

function comparableVersion(
  version: string,
): { readonly parts: readonly bigint[]; readonly prerelease: boolean } | undefined {
  const parsed = /^(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
    version,
  );
  if (parsed === null) return undefined;
  return {
    parts: [BigInt(parsed[1] ?? "0"), BigInt(parsed[2] ?? "0"), BigInt(parsed[3] ?? "0")],
    prerelease: parsed[4] !== undefined,
  };
}

// `claude --version` answers "2.1.258 (Claude Code)" and `codex --version` answers
// "codex-cli 0.149.1", so the version is the first dotted number on the output rather
// than the whole line either of them prints.
export function versionFrom(stdout: string): string | undefined {
  const match = /\d+\.\d+(?:\.[0-9A-Za-z.+-]+)?/.exec(stdout);
  return match?.[0];
}
