import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";
import { z } from "zod";
import { cliLoginError } from "../adapters/llm/cli-login-error.js";
import { cliCommand } from "../kernel/cli-command.js";
import type { HostCliId, HostCliStatus, HostLlmId } from "../kernel/ports/host-cli.js";
import {
  type CliProbe,
  cliProbeTimeoutMs,
  readinessFromProbe,
} from "../slices/settings/cli-status.js";

export function hostCommandName(id: HostCliId): string {
  return id === "claude-code" ? "claude" : id === "codex-image" ? "codex" : id;
}
export async function resolveHostCommand(
  id: HostLlmId,
  env: Readonly<NodeJS.ProcessEnv>,
): Promise<string> {
  for (const directory of (env.PATH ?? "").split(delimiter)) {
    if (!isAbsolute(directory)) continue;
    const path = join(directory, hostCommandName(id));
    try {
      await access(path, constants.X_OK);
      if ((await stat(path)).isFile()) return path;
    } catch (error) {
      if (!isCode(error, "ENOENT") && !isCode(error, "ENOTDIR") && !isCode(error, "EACCES"))
        throw error;
    }
  }
  throw Object.assign(new Error(`${hostCommandName(id)} was not found on this machine's PATH.`), {
    code: "ENOENT",
  });
}
const authSchema = z.object({ loggedIn: z.boolean() });
export function parseHostLogin(
  id: HostLlmId,
  stdout: string,
  stderr: string,
): HostCliStatus["login"] {
  if (id === "gemini") return "unknown";
  if (id === "codex") {
    const text = `${stdout}\n${stderr}`.trim();
    if (/^Not logged in\.?$/i.test(text)) return "signed-out";
    if (/^Logged in using (?:ChatGPT|an API key|API key)\b/i.test(text)) return "signed-in";
    return "unknown";
  }
  try {
    const result = authSchema.safeParse(JSON.parse(stdout));
    return result.success ? (result.data.loggedIn ? "signed-in" : "signed-out") : "unknown";
  } catch {
    return "unknown";
  }
}
export async function readHostLogin(
  binary: string,
  id: HostLlmId,
  signal: AbortSignal,
): Promise<HostCliStatus["login"]> {
  if (id === "gemini") return "unknown";
  const command = cliCommand(binary);
  return new Promise((resolve) => {
    execFile(
      command.file,
      [...command.args, ...(id === "claude-code" ? ["auth", "status"] : ["login", "status"])],
      { timeout: cliProbeTimeoutMs, maxBuffer: 64 * 1024, signal, windowsHide: true },
      (error, stdout, stderr) => {
        if (error && (error.killed || typeof error.code !== "number")) return resolve("unknown");
        resolve(parseHostLogin(id, stdout, stderr));
      },
    );
  });
}
export interface HostStatusDeps {
  readonly resolve: (id: HostLlmId) => Promise<string>;
  readonly probe: CliProbe;
  readonly now: () => number;
  readonly login?: typeof readHostLogin;
}
export function createHostStatus(deps: HostStatusDeps): (id: HostCliId) => Promise<HostCliStatus> {
  const cache = new Map<HostLlmId, { until: number; value: Promise<HostCliStatus> }>();
  async function read(id: HostLlmId): Promise<HostCliStatus> {
    let command: string;
    try {
      command = await deps.resolve(id);
    } catch (error) {
      return {
        id,
        command: hostCommandName(id),
        installed: false,
        login: "unknown",
        issueKind: isCode(error, "ENOENT") ? "missing" : "bridge",
        issue: isCode(error, "ENOENT")
          ? `${hostCommandName(id)} was not found on this machine. Install it and sign in there, then run the launcher again: npx @gentbajko/slopify --docker`
          : `Slopify could not check for ${hostCommandName(id)} on this machine (${error instanceof Error ? error.message : String(error)}). Fix the problem, then run the launcher again: npx @gentbajko/slopify --docker`,
      };
    }
    const readiness = readinessFromProbe(
      await deps.probe(command, ["--version"], cliProbeTimeoutMs),
      {
        id,
        auth: "cli",
        family: "llm",
        displayName: id,
        binary: command,
        versionArgs: ["--version"],
      },
    );
    if (readiness.kind !== "cli") throw new Error("Expected CLI readiness.");
    const base = {
      id,
      command,
      installed: readiness.installed,
      ...(readiness.version === undefined ? {} : { version: readiness.version }),
    };
    if (!readiness.installed)
      return {
        ...base,
        login: "unknown",
        issueKind: "missing",
        issue: `${command} is installed but did not answer "${hostCommandName(id)} --version". Reinstall or update it on this machine, then run the launcher again: npx @gentbajko/slopify --docker`,
      };
    if (readiness.issue)
      return { ...base, login: "unknown", issueKind: "version", issue: readiness.issue };
    const login = await (deps.login ?? readHostLogin)(
      command,
      id,
      AbortSignal.timeout(cliProbeTimeoutMs),
    );
    return {
      ...base,
      login,
      ...(login === "signed-out"
        ? {
            issueKind: "login" as const,
            issue: cliLoginError(id, "Not logged in")?.message ?? "Sign in on the host.",
          }
        : {}),
    };
  }
  return async (id) => {
    const source = id === "codex-image" ? "codex" : id;
    let entry = cache.get(source);
    if (!entry || entry.until <= deps.now()) {
      const value = read(source);
      entry = { until: Number.POSITIVE_INFINITY, value };
      cache.set(source, entry);
      const current = entry;
      void value.then(
        () => {
          current.until = deps.now() + 5000;
        },
        () => {
          cache.delete(source);
        },
      );
    }
    return { ...(await entry.value), id };
  };
}
function isCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
