import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { z } from "zod";
import type { Ids } from "../../kernel/ids.js";
import type { Paths } from "../../kernel/paths.js";
import { projectTemplateSchema } from "../project-templates/schema.js";
import { projectDir, stagingPath } from "./layout.js";
import { type StagedFile, stageKinds } from "./model.js";
import { insertStagedFile, stagedFiles } from "./repo.js";

const record = z.record(z.string(), z.string());
const promptRow = z
  .object({
    id: z.string(),
    kind: z.string(),
    name: z.string(),
    body: z.string(),
    slots: z.string(),
    updated_at: z.string(),
  })
  .strict();
const libraryRow = z
  .object({
    id: z.string(),
    name: z.string(),
    body: z.string(),
    slots: z.string(),
    updated_at: z.string(),
  })
  .strict();
const voiceRow = z
  .object({ id: z.string(), provider: z.string(), name: z.string(), voice_id: z.string() })
  .strict();
const stagedMeta = z
  .object({
    id: z.string(),
    stageKind: z.enum(stageKinds),
    originalFilename: z.string(),
    bytes: z.number(),
    archivePath: z.string(),
  })
  .strict();
const manifestSchema = z
  .object({
    version: z.literal(1),
    createdAt: z.string(),
    settings: record,
    prompts: z.array(promptRow),
    entries: z.array(libraryRow.extend({ category: z.string(), mode: z.string() })),
    voices: z.array(voiceRow),
    templates: z.array(projectTemplateSchema),
    staged: z.array(stagedMeta),
  })
  .strict();

export interface PortableDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly ids: Ids;
  readonly now: () => string;
}

export interface PortableImportResult {
  readonly settings: number;
  readonly prompts: number;
  readonly entries: number;
  readonly voices: number;
  readonly templates: number;
  readonly stagedFiles: number;
}

export interface StorageUsage {
  readonly data: number;
  readonly projects: number;
  readonly staging: number;
  readonly byProject: readonly {
    readonly id: string;
    readonly title: string;
    readonly bytes: number;
  }[];
}

export function exportPortable(deps: PortableDeps): Uint8Array<ArrayBuffer> {
  const entries: Record<string, [Uint8Array, { readonly level: 0 }]> = {};
  const staged = stagedFiles(deps.db).flatMap((file) => {
    const path = stagingPath(deps.paths, file.path);
    if (!existsSync(path)) return [];
    const archivePath = `staging/${file.id}`;
    entries[archivePath] = [readFileSync(path), { level: 0 }];
    return [
      {
        id: file.id,
        stageKind: file.stageKind,
        originalFilename: file.originalFilename,
        bytes: file.bytes,
        archivePath,
      },
    ];
  });
  const settings: Record<string, string> = {};
  for (const row of deps.db.prepare("SELECT key,value FROM settings ORDER BY key").all()) {
    if (typeof row.key === "string" && typeof row.value === "string") settings[row.key] = row.value;
  }
  const prompts = deps.db
    .prepare("SELECT id,kind,name,body,slots,updated_at FROM prompts ORDER BY id")
    .all();
  const entryRows = deps.db
    .prepare("SELECT id,name,body,slots,category,mode,updated_at FROM entries ORDER BY id")
    .all();
  const voices = deps.db.prepare("SELECT id,provider,name,voice_id FROM voices ORDER BY id").all();
  const templates = deps.db
    .prepare(
      "SELECT t.id,r.version,r.name,t.created_at AS createdAt,r.created_at AS updatedAt,r.document_json AS document FROM project_templates t JOIN project_template_revisions r ON r.template_id=t.id AND r.version=t.head_version ORDER BY t.id",
    )
    .all()
    .map((row) =>
      projectTemplateSchema.parse({ ...row, document: JSON.parse(String(row.document)) }),
    );
  const manifest = manifestSchema.parse({
    version: 1,
    createdAt: deps.now(),
    settings,
    prompts,
    entries: entryRows,
    voices,
    templates,
    staged,
  });
  entries["manifest.json"] = [strToU8(JSON.stringify(manifest)), { level: 0 }];
  return zipSync(entries);
}

export function importPortable(deps: PortableDeps, bytes: Uint8Array): PortableImportResult {
  const archive = unzipSync(bytes);
  const manifestBytes = archive["manifest.json"];
  if (manifestBytes === undefined) throw new Error("The backup has no manifest.");
  const manifest = manifestSchema.parse(JSON.parse(strFromU8(manifestBytes)));
  let settings = 0;
  for (const [key, value] of Object.entries(manifest.settings)) {
    deps.db
      .prepare(
        "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, value);
    settings += 1;
  }
  let prompts = 0;
  for (const row of manifest.prompts) {
    deps.db
      .prepare(
        "INSERT INTO prompts(id,kind,name,body,slots,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,name=excluded.name,body=excluded.body,slots=excluded.slots,updated_at=excluded.updated_at",
      )
      .run(row.id, row.kind, row.name, row.body, row.slots, row.updated_at);
    prompts += 1;
  }
  let entries = 0;
  for (const row of manifest.entries) {
    deps.db
      .prepare(
        "INSERT INTO entries(id,category,mode,name,body,slots,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET category=excluded.category,mode=excluded.mode,name=excluded.name,body=excluded.body,slots=excluded.slots,updated_at=excluded.updated_at",
      )
      .run(row.id, row.category, row.mode, row.name, row.body, row.slots, row.updated_at);
    entries += 1;
  }
  let voices = 0;
  for (const row of manifest.voices) {
    deps.db
      .prepare(
        "INSERT INTO voices(id,provider,name,voice_id) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET provider=excluded.provider,name=excluded.name,voice_id=excluded.voice_id",
      )
      .run(row.id, row.provider, row.name, row.voice_id);
    voices += 1;
  }
  let templates = 0;
  for (const template of manifest.templates) {
    const exists = deps.db.prepare("SELECT 1 FROM project_templates WHERE id=?").get(template.id);
    if (exists !== undefined) continue;
    deps.db
      .prepare(
        "INSERT INTO project_templates(id,head_version,creation_hash,created_at) VALUES(?,?,?,?)",
      )
      .run(
        template.id,
        template.version,
        `portable:${template.id}:${template.version}`,
        template.createdAt,
      );
    deps.db
      .prepare(
        "INSERT INTO project_template_revisions(template_id,version,name,document_json,created_at) VALUES(?,?,?,?,?)",
      )
      .run(
        template.id,
        template.version,
        template.name,
        JSON.stringify(template.document),
        template.updatedAt,
      );
    templates += 1;
  }
  let stagedCount = 0;
  for (const file of manifest.staged) {
    const content = archive[file.archivePath];
    if (content === undefined) continue;
    const id = deps.ids.next();
    writeFileSync(stagingPath(deps.paths, id), content, { mode: 0o600, flag: "wx" });
    const staged: StagedFile = {
      id,
      stageKind: file.stageKind,
      path: id,
      originalFilename: file.originalFilename,
      bytes: content.byteLength,
      state: "staged",
      createdAt: deps.now(),
    };
    insertStagedFile(deps.db, staged);
    stagedCount += 1;
  }
  return { settings, prompts, entries, voices, templates, stagedFiles: stagedCount };
}

export function storageBytes(paths: Paths): {
  readonly data: number;
  readonly projects: number;
  readonly staging: number;
} {
  const projects = directoryBytes(paths.projects);
  const staging = directoryBytes(paths.staging);
  return { data: directoryBytes(paths.dataDir), projects, staging };
}

export function storageUsage(deps: Pick<PortableDeps, "db" | "paths">): StorageUsage {
  const totals = storageBytes(deps.paths);
  const byProject = deps.db
    .prepare("SELECT id,title FROM projects ORDER BY created_at DESC, id DESC")
    .all()
    .flatMap((row) => {
      if (typeof row.id !== "string" || typeof row.title !== "string") return [];
      return [
        {
          id: row.id,
          title: row.title,
          bytes: directoryBytes(projectDir(deps.paths, row.id)),
        },
      ];
    });
  return { ...totals, byProject };
}

function directoryBytes(root: string): number {
  if (!existsSync(root)) return 0;
  let total = 0;
  for (const entry of readdirSync(root, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    total += statSync(join(entry.parentPath, entry.name)).size;
  }
  return total;
}
