import { z } from "zod";
import { fontMaxBytes } from "../fonts/model.js";

// The full backup (Settings → Backup & storage → Export everything): a tar whose members
// come in this order, so an import can check every JSON part before it writes a single file:
//
//   manifest.json                what made it, when, and which projects it carries
//   data/library.json            settings, library, templates, schedules, drafts
//   data/usage.json              the Usage screen's event log
//   data/projects/<id>.json      one per project: every row it needs to open and keep going
//   files/...                    the bytes: project folders, uploaded fonts, draft uploads and
//                                the pictures kept in the database (cast, end screen)
//   checksums.json               a SHA-256 per file, written as the files streamed out
//
// Rows travel as the database holds them, table by table, with the schema version they fit;
// an import loads them into a scratch database at that version and lets the same migrations
// an upgrade runs carry them forward. Provider keys, the telemetry machine id, logs, the
// model cache, updates and staging leftovers are never read.

export const backupFormat = "slopify-backup";
export const backupSchemaVersion = 2;

export const manifestMember = "manifest.json";
export const libraryMember = "data/library.json";
export const usageMember = "data/usage.json";
export const checksumsMember = "checksums.json";
export const projectMember = (id: string): string => `data/projects/${id}.json`;
export const projectFileMember = (id: string, path: string): string =>
  `files/projects/${id}/${path}`;
export const fontMember = (name: string): string => `files/fonts/${name}`;
export const stagedMember = (id: string): string => `files/staging/${id}`;
// A picture from image_blobs, named by its SHA-256: the database keeps the bytes (cast
// pictures, the end screen image), so they travel as files rather than inside a JSON row.
export const imageMember = (sha256: string): string => `files/images/${sha256}`;

// Every table a project's rows live in, parents before children. The queue is left out on
// purpose: a backup never carries a project that is waiting to run.
export const projectTables = [
  "projects",
  "project_controls",
  "stages",
  "attempts",
  "stage_pieces",
  "outputs",
  "project_revisions",
  "project_heads",
  "project_assets",
  "revision_outputs",
  "revision_pieces",
  "revision_mutations",
  "rebuild_previews",
  "rebuild_admissions",
  "revision_work",
  "revision_work_pieces",
  "revision_work_reservations",
  "project_control_receipts",
  "revision_provided_reviews",
  "review_checkpoints",
  "review_checkpoint_approvals",
  "project_recovery_requests",
  "youtube_description_edits",
  "project_uploads",
  // Since 3.2.8: the YouTube video each upload became, and its A/B test.
  "youtube_videos",
  // Since 3.3.0: each project's posting-plan slot, Studio's numbers and its A/B results.
  "upload_slots",
  "video_stats",
  "ab_results",
  // Since 2.5.0. Left out on purpose: plan_limit_waits and plan_limit_waiters (an account's
  // current wait, a lease of this install) and prompt_softening (a pending one-off request).
  // Since 3.0.8, narration_retries is left out too: the tries of a run, not of the project.
  // Since 3.1.0, prepared_videos too: a schedule's hold on this install's next run.
  // Since 3.2.4, project_set_aside too: a Home card hidden on this install, which a restored
  // project simply shows again.
  "review_verdicts",
  "provider_usage",
  "plan_limit_readings",
  "project_channels",
  "project_trash",
] as const;
export type ProjectTable = (typeof projectTables)[number];

export const libraryTables = [
  "settings",
  "prompts",
  "entries",
  "voices",
  "document_themes",
  "narration_aliases",
  "project_templates",
  "project_template_revisions",
  "schedules",
  "schedule_runs",
  "schedule_topics",
  "staged_files",
  "play_drafts",
  "play_draft_attachments",
  "project_template_instantiations",
  // Since 2.5.0: prompt history, channels with their cast, episode memories and existing
  // videos. image_blobs travel as files (`imageMember`), listed in the library part's `images`.
  "library_versions",
  "channels",
  "cast_members",
  "cast_images",
  "episode_memories",
  "channel_videos",
  // Since 3.0.0: what topic generation, episode summaries and cast pictures cost, which
  // belongs to a schedule or channel rather than a project.
  "standalone_usage",
] as const;
export type LibraryTable = (typeof libraryTables)[number];

export const usageTables = ["telemetry_events"] as const;

// Ceilings a well-formed backup of a real install stays far below. They bound what a hostile
// or damaged file can make an import hold in memory before anything is written.
export const backupMaxJsonBytes = 256 * 1024 * 1024;
export const backupMaxManifestBytes = 4 * 1024 * 1024;
const maxRows = 2_000_000;
const maxProjects = 50_000;
const maxFilesPerProject = 200_000;

const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
export const backupId = z.string().regex(idPattern);

// A relative path inside a project folder: plain segments, no way up or out.
export function safeRelativePath(path: string): boolean {
  if (path.length === 0 || path.length > 512 || path.includes("\\") || path.includes("\0"))
    return false;
  return path
    .split("/")
    .every((part) => part.length > 0 && part !== "." && part !== ".." && part.length <= 255);
}

const relativePath = z.string().refine(safeRelativePath, "A file path leaves its folder.");

const cell = z.union([z.string(), z.number().finite(), z.null()]);
const row = z.record(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), cell);
export type BackupRow = z.infer<typeof row>;
const rows = z.array(row).max(maxRows);

function tablesOf<const T extends readonly string[]>(names: T) {
  return z
    .object(
      Object.fromEntries(names.map((name) => [name, rows.optional()])) as {
        [K in T[number]]: z.ZodOptional<typeof rows>;
      },
    )
    .strict();
}

// Only the first three fields are read before the version check, so a backup from a newer
// Slopify is refused with "update first" rather than a list of fields this build can't read.
export const manifestHead = z
  .object({
    format: z.literal(backupFormat),
    schemaVersion: z.number().int().positive(),
    appVersion: z.string().max(40),
  })
  .loose();

export const manifestSchema = z
  .object({
    format: z.literal(backupFormat),
    schemaVersion: z.literal(backupSchemaVersion),
    appVersion: z.string().max(40),
    databaseVersion: z.number().int().positive(),
    backupId,
    createdAt: z.string().max(40),
    projects: z
      .array(
        z
          .object({ id: backupId, title: z.string().max(200), bytes: z.number().int().min(0) })
          .strict(),
      )
      .max(maxProjects),
    files: z.number().int().min(0),
    bytes: z.number().int().min(0),
  })
  .strict();
export type BackupManifest = z.infer<typeof manifestSchema>;

// A picture in image_blobs is at most this large (cast uploads are capped well below it).
export const backupMaxImageBytes = 64 * 1024 * 1024;
export const backupImage = z
  .object({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    mime: z.enum(["image/png", "image/jpeg"]),
    bytes: z.number().int().min(1).max(backupMaxImageBytes),
  })
  .strict();

const fileEntry = z.object({ path: relativePath, bytes: z.number().int().min(0) }).strict();

export const libraryPartSchema = z
  .object({
    tables: tablesOf(libraryTables),
    fonts: z
      .array(
        z
          .object({
            name: z.string().regex(/^uploaded-[a-f0-9]{64}\.(ttf|otf)$/),
            bytes: z.number().int().min(12).max(fontMaxBytes),
          })
          .strict(),
      )
      .max(64),
    staged: z
      .array(z.object({ id: backupId, bytes: z.number().int().positive() }).strict())
      .max(10_000),
    // Absent in backups made before channels.
    images: z.array(backupImage).max(100_000).optional(),
  })
  .strict();
export type LibraryPart = z.infer<typeof libraryPartSchema>;

export const usagePartSchema = z.object({ tables: tablesOf(usageTables) }).strict();
export type UsagePart = z.infer<typeof usagePartSchema>;

export const projectPartSchema = z
  .object({
    id: backupId,
    tables: tablesOf(projectTables),
    files: z.array(fileEntry).max(maxFilesPerProject),
  })
  .strict()
  .refine(
    (part) => part.tables.projects?.length === 1 && part.tables.projects[0]?.id === part.id,
    "A project part must hold exactly its own project row.",
  );
export type ProjectPart = z.infer<typeof projectPartSchema>;

export const checksumsSchema = z
  .object({
    files: z
      .array(
        z
          .object({ member: z.string().max(1024), sha256: z.string().regex(/^[a-f0-9]{64}$/) })
          .strict(),
      )
      .max(maxProjects * 10 + 1_000_000),
  })
  .strict();
