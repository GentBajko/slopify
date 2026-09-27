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
import { type SampleId, type SampleProjects, sampleIds } from "./model.js";
import { readSampleRecord, writeSampleRecord } from "./state.js";

// The bundled samples: finished projects that ship with the app as backup archives
// (`assets/sample/`, built by `src/sample-build/`) - "The Library of Alexandria" (video,
// shorts, article, PDF, description, captions, images), an audiobook read by a narrator and two
// character voices, and a two-host podcast. Each is imported on first launch, can be played
// and explored for free, and is read-only: the HTTP edge refuses every change to it, so nothing
// on it can ever reach a paid provider. "Make my own copy" clones one into an ordinary project;
// Settings → Restore samples brings back the originals.

const bundled = (file: string): string =>
  fileURLToPath(new URL(`../../assets/sample/${file}`, import.meta.url));

export const sampleArchives: Readonly<Record<SampleId, string>> = {
  library: bundled("sample-project.tar"),
  audiobook: bundled("sample-audiobook.tar"),
  podcast: bundled("sample-podcast.tar"),
};
export const sampleArchive = sampleArchives.library;

export interface SampleDeps extends BackupDeps {
  readonly log: Log;
  // Where the archives are; the bundled ones unless a test hands in others.
  readonly archives?: Partial<Record<SampleId, string>> | undefined;
}

export type SampleRefusal = {
  readonly ok: false;
  readonly status: 404 | 409 | 500;
  readonly detail: string;
};

const archiveOf = (deps: SampleDeps, id: SampleId): string =>
  deps.archives?.[id] ?? sampleArchives[id];

function recordedProject(db: DatabaseSync, id: SampleId): string | undefined {
  const record = readSampleRecord(db, id);
  return record !== undefined && projectTitle(db, record.projectId) !== undefined
    ? record.projectId
    : undefined;
}

// The Library of Alexandria's project, while it is in Projects.
export function sampleProjectId(db: DatabaseSync): string | undefined {
  return recordedProject(db, "library");
}

export function sampleProjectIds(db: DatabaseSync): SampleProjects {
  return {
    library: recordedProject(db, "library") ?? null,
    audiobook: recordedProject(db, "audiobook") ?? null,
    podcast: recordedProject(db, "podcast") ?? null,
  };
}

export function isSampleProject(db: DatabaseSync, projectId: string): boolean {
  return sampleIds.some((id) => readSampleRecord(db, id)?.projectId === projectId);
}

export type SeedOutcome = "seeded" | "already-seeded" | "missing";

// First launch only, for each sample: once one was seeded, deleting it keeps it deleted until
// Restore samples is pressed. A sample added in a later version is seeded on the first launch
// of that version.
export async function seedSamples(
  deps: SampleDeps,
): Promise<Readonly<Record<SampleId, SeedOutcome>>> {
  const outcomes: Partial<Record<SampleId, SeedOutcome>> = {};
  for (const id of sampleIds) {
    if (readSampleRecord(deps.db, id) !== undefined) {
      outcomes[id] = "already-seeded";
      continue;
    }
    const archive = archiveOf(deps, id);
    if (!existsSync(archive)) {
      deps.log.write("warn", "sample.seed", {
        detail: `A bundled sample project is missing from this install (${archive}).`,
      });
      outcomes[id] = "missing";
      continue;
    }
    await importSample(deps, id, archive);
    outcomes[id] = "seeded";
  }
  return {
    library: outcomes.library ?? "missing",
    audiobook: outcomes.audiobook ?? "missing",
    podcast: outcomes.podcast ?? "missing",
  };
}

// Puts back every sample as it shipped: one that was deleted comes back, one that is there is
// replaced by the original. Copies made of them are not touched.
export async function restoreSamples(
  deps: SampleDeps,
): Promise<{ readonly ok: true; readonly samples: SampleProjects } | SampleRefusal> {
  const missing = sampleIds.filter((id) => !existsSync(archiveOf(deps, id)));
  if (missing.length > 0)
    return {
      ok: false,
      status: 500,
      detail:
        "The sample projects aren't all part of this install, so they can't be restored. Update Slopify (npx @gentbajko/slopify@latest, or pull the latest Docker image) and try Restore samples again.",
    };
  for (const id of sampleIds) {
    // The recorded sample, even when it waits in Settings → Trash: its rows would stop the
    // archive's copy (same ids) from coming in, so it is removed for good first.
    const current = readSampleRecord(deps.db, id)?.projectId;
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
              ? "A sample is still being worked on, so it can't be replaced. Wait for it to finish, then press Restore samples again."
              : "Some of an old sample's files couldn't be removed. Close any program using files in its project folder, then press Restore samples again.",
        };
    }
    await importSample(deps, id, archiveOf(deps, id));
  }
  return { ok: true, samples: sampleProjectIds(deps.db) };
}

async function importSample(deps: SampleDeps, id: SampleId, archive: string): Promise<string> {
  const summary = await importBackup(deps, createReadStream(archive));
  const skipped = summary.projects.skipped[0];
  const project =
    summary.projects.imported[0] ??
    (skipped !== undefined && projectTitle(deps.db, skipped.id) !== undefined
      ? skipped
      : undefined);
  if (project === undefined)
    throw new Error(
      `Slopify couldn't add a sample project${skipped === undefined ? "" : ` (${skipped.reason})`}. Reinstall Slopify, then try Restore samples in Settings → Backup & storage; if it happens again, use Download diagnostics in Settings and report it.`,
    );
  writeSampleRecord(
    deps.db,
    { projectId: project.id, seededAt: deps.clock.now().toISOString() },
    id,
  );
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
        "Only a sample project can be copied this way. Open the sample from Projects and press Make my own copy there.",
    };
  const title = projectTitle(deps.db, projectId);
  if (title === undefined)
    return {
      ok: false,
      status: 404,
      detail:
        "That sample project is no longer here. Bring it back with Settings → Backup & storage → Restore samples, then press Make my own copy.",
    };
  return { ok: true, ...copyProject(deps, projectId, `${title} (my copy)`) };
}
