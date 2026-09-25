import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { extname, isAbsolute } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { HostCliPorts } from "../../kernel/ports/host-cli.js";
import { type CliProbe, cliProbeTimeoutMs, readinessFromProbe } from "./cli-status.js";
import { type ProviderId, type ProviderStatus, providerById } from "./model.js";
import { readSetting, writeSetting } from "./repo.js";

export const cliPathMaxLength = 4096;
const pathSchema = z
  .string()
  .trim()
  .max(cliPathMaxLength)
  .refine((value) => value === "" || (isAbsolute(value) && !/[\p{Cc}]/u.test(value)));
const storedPathSchema = z.string().max(cliPathMaxLength).nullable();
const saves = new WeakMap<DatabaseSync, Map<ProviderId, Promise<void>>>();

function installationId(id: ProviderId): ProviderId {
  return id === "codex-image" ? "codex" : id;
}

export interface CliPathStatus {
  readonly configured: string | null;
  readonly command: string;
}
export interface CliPathDeps {
  readonly db: DatabaseSync;
  readonly probe: CliProbe;
  readonly hostCliStatus?: HostCliPorts["status"] | undefined;
}
export type SaveCliPathResult =
  | { readonly ok: true; readonly status: ProviderStatus }
  | { readonly ok: false; readonly message: string };

export function cliPathStatus(db: DatabaseSync, id: ProviderId): CliPathStatus {
  const provider = providerById(id);
  if (provider.auth !== "cli") throw new Error(`${id} is not a CLI provider`);
  const stored = readSetting(db, `cli.path.${installationId(id)}`);
  const configured = stored === undefined ? null : storedPathSchema.parse(JSON.parse(stored));
  return { configured, command: configured ?? provider.binary };
}

// Read on each attempt, so a saved path reaches the next invocation without a restart.
export function cliBinary(db: DatabaseSync, id: ProviderId): string {
  return cliPathStatus(db, id).command;
}

export function cliPathChanged(db: DatabaseSync, provider: ProviderStatus | undefined): boolean {
  return (
    provider?.cliPath !== undefined &&
    !provider.cliPath.managedOnHost &&
    cliPathStatus(db, provider.id).command !== provider.cliPath.command
  );
}

export async function saveCliPath(
  deps: CliPathDeps,
  id: ProviderId,
  raw: string,
): Promise<SaveCliPathResult> {
  if (deps.hostCliStatus)
    return {
      ok: false,
      message:
        "Slopify runs in Docker, so it finds these tools on your computer (the Docker host) by itself. If you installed or moved one, run the Slopify Docker launcher again.",
    };
  // A slow version probe must not overwrite a later Save or Reset from another tab.
  let queue = saves.get(deps.db);
  if (queue === undefined) {
    queue = new Map();
    saves.set(deps.db, queue);
  }
  const sharedId = installationId(id);
  const previous = queue.get(sharedId) ?? Promise.resolve();
  const next = previous.then(() => save(deps, id, raw));
  const settled = next.then(
    () => {},
    () => {},
  );
  queue.set(sharedId, settled);
  try {
    return await next;
  } finally {
    if (queue.get(sharedId) === settled) queue.delete(sharedId);
  }
}

async function save(deps: CliPathDeps, id: ProviderId, raw: string): Promise<SaveCliPathResult> {
  const provider = providerById(id);
  if (provider.auth !== "cli")
    return { ok: false, message: `${provider.displayName} uses an API key, not a CLI executable.` };
  const parsed = pathSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      message:
        "Enter the full path to the program file, without quotes or extra options, or leave it blank to let Slopify find it.",
    };
  const configured = parsed.data === "" ? null : parsed.data;
  if (configured !== null) {
    try {
      if (!(await stat(configured)).isFile())
        return {
          ok: false,
          message: "This path is a folder. Enter the path to the program file inside it.",
        };
      await access(
        configured,
        process.platform === "win32" ||
          [".js", ".mjs", ".cjs"].includes(extname(configured).toLowerCase())
          ? constants.R_OK
          : constants.X_OK,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        ["ENOENT", "ENOTDIR", "EACCES", "EPERM", "ELOOP"].includes(String(error.code))
      )
        return {
          ok: false,
          message:
            "Slopify cannot find or run a program at this path. Check the path is correct and the file is allowed to run.",
        };
      throw error;
    }
  }
  const command = configured ?? provider.binary;
  const probed = await deps.probe(command, provider.versionArgs, cliProbeTimeoutMs);
  const readiness = readinessFromProbe(probed, provider);
  if (configured !== null && readiness.kind === "cli" && !readiness.installed)
    return {
      ok: false,
      message:
        probed.error ??
        `${provider.displayName} did not answer --version successfully within ${cliProbeTimeoutMs / 1000} seconds. Choose its executable file without arguments.`,
    };
  writeSetting(deps.db, `cli.path.${installationId(id)}`, JSON.stringify(configured));
  return {
    ok: true,
    status: {
      id,
      family: provider.family,
      displayName: provider.displayName,
      readiness,
      cliPath: { configured, command },
    },
  };
}
