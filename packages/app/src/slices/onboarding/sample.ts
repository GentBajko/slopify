import { createReadStream, existsSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import type { Catalogue } from "../../catalog/schema.js";
import type { Log } from "../../kernel/log.js";
import type { BackupDeps } from "../storage/backup-export.js";
import { importBackup } from "../storage/backup-import.js";
import { deleteProject } from "../storage/delete-project.js";
import { projectTitle } from "../storage/repo.js";
import { copyProject } from "./copy.js";
import { readSampleRecord, writeSampleRecord } from "./state.js";

// The bundled sample project: a finished project (video, shorts, article, PDF, description,
// captions, images) that ships with the app as a backup archive (`assets/sample/`, built by
// `src/sample-build/`). It is imported on first launch, can be played and explored for free,
// and is read-only: the HTTP edge refuses every change to it, so nothing on it can ever reach
// a paid provider. "Make my own copy" clones it into an ordinary project; Settings → Restore
// sample brings back the original.

export const sampleArchive = fileURLToPath(
  new URL("../../assets/sample/sample-project.tar", import.meta.url),
);

export interface SampleDeps extends BackupDeps {
  readonly log: Log;
  // Where the archive is; the bundled one unless a test hands in another.
  readonly archive?: string | undefined;
}

export type SampleRefusal = {
  readonly ok: false;
  readonly status: 404 | 409 | 500;
  readonly detail: string;
};

export function sampleProjectId(db: DatabaseSync): string | undefined {
  const record = readSampleRecord(db);
  return record !== undefined && projectTitle(db, record.projectId) !== undefined
    ? record.projectId
    : undefined;
}

export function isSampleProject(db: DatabaseSync, projectId: string): boolean {
  return readSampleRecord(db)?.projectId === projectId;
}

// First launch only: once the sample was seeded, deleting it keeps it deleted until Restore
// sample is pressed.
export async function seedSample(
  deps: SampleDeps,
): Promise<"seeded" | "already-seeded" | "missing"> {
  if (readSampleRecord(deps.db) !== undefined) return "already-seeded";
  const archive = deps.archive ?? sampleArchive;
  if (!existsSync(archive)) {
    deps.log.write("warn", "sample.seed", {
      detail: `The bundled sample project is missing from this install (${archive}).`,
    });
    return "missing";
  }
  await importSample(deps, archive);
  return "seeded";
}

export async function restoreSample(
  deps: SampleDeps,
): Promise<{ readonly ok: true; readonly projectId: string } | SampleRefusal> {
  const archive = deps.archive ?? sampleArchive;
  if (!existsSync(archive))
    return {
      ok: false,
      status: 500,
      detail:
        "The sample project isn't part of this install, so it can't be restored. Update Slopify (npx @gentbajko/slopify@latest, or pull the latest Docker image) and try Restore sample again.",
    };
  // The recorded sample, even when it waits in Settings → Trash: its rows would stop the
  // archive's copy (same ids) from coming in, so it is removed for good first.
  const current = readSampleRecord(deps.db)?.projectId;
  if (current !== undefined) {
    const removed = deleteProject(
      {
        db: deps.db,
        paths: deps.paths,
        log: deps.log,
        ...(deps.hasInflight === undefined ? {} : { hasInflight: deps.hasInflight }),
      },
      current,
    );
    if (!removed.ok && removed.reason !== "no-project")
      return {
        ok: false,
        status: removed.reason === "running" ? 409 : 500,
        detail:
          removed.reason === "running"
            ? "The sample is still being worked on, so it can't be replaced. Wait for it to finish, then press Restore sample again."
            : "Some of the old sample's files couldn't be removed. Close any program using files in its project folder, then press Restore sample again.",
      };
  }
  return { ok: true, projectId: await importSample(deps, archive) };
}

async function importSample(deps: SampleDeps, archive: string): Promise<string> {
  const summary = await importBackup(deps, createReadStream(archive));
  const skipped = summary.projects.skipped[0];
  const project =
    summary.projects.imported[0] ??
    (skipped !== undefined && projectTitle(deps.db, skipped.id) !== undefined
      ? skipped
      : undefined);
  if (project === undefined)
    throw new Error(
      `Slopify couldn't add the sample project${skipped === undefined ? "" : ` (${skipped.reason})`}. Reinstall Slopify, then try Restore sample in Settings → Backup & storage; if it happens again, use Download diagnostics in Settings and report it.`,
    );
  writeSampleRecord(deps.db, {
    projectId: project.id,
    seededAt: deps.clock.now().toISOString(),
  });
  return project.id;
}

export function copySample(
  deps: SampleDeps & { readonly catalogue: Catalogue },
  projectId: string,
): { readonly ok: true; readonly projectId: string } | SampleRefusal {
  if (!isSampleProject(deps.db, projectId))
    return {
      ok: false,
      status: 404,
      detail:
        "Only the sample project can be copied this way. Open the sample from Projects and press Make my own copy there.",
    };
  const title = projectTitle(deps.db, projectId);
  if (title === undefined)
    return {
      ok: false,
      status: 404,
      detail:
        "The sample project is no longer here. Bring it back with Settings → Backup & storage → Restore sample, then press Make my own copy.",
    };
  return { ok: true, ...copyProject(deps, projectId, `${title} (my copy)`) };
}
