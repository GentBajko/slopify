import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { crc32 } from "node:zlib";
import { strFromU8, strToU8, Unzip, UnzipInflate, zipSync } from "fflate";
import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import type { Ids } from "../../kernel/ids.js";
import type { Paths } from "../../kernel/paths.js";
import { silenceGapSecondsMax } from "../admission/rules.js";
import { detectSlots } from "../admission/substitute.js";
import { fontMaxBytes } from "../fonts/model.js";
import { readFontMetadata } from "../fonts/sfnt.js";
import { lintEntry, lintPrompt } from "../library/lint.js";
import { entryCategories, entryModes, promptKinds } from "../library/model.js";
import { listEntries, listPrompts } from "../library/repo.js";
import { projectTemplateSchema } from "../project-templates/schema.js";
import { cliPathMaxLength } from "../settings/cli-paths.js";
import { appearances, providerById, providerIds } from "../settings/model.js";
import { listVoices } from "../settings/repo.js";
import { voiceIdMax, voiceNameMax } from "../settings/voices.js";
import { projectDir, stagingPath } from "./layout.js";
import { type StagedFile, stageKinds } from "./model.js";
import { insertStagedFile, stagedFiles } from "./repo.js";

const record = z.record(z.string(), z.string());
export const portableMaxArchiveBytes = 100 * 1024 * 1024;
export const portableMaxExpandedBytes = 128 * 1024 * 1024;
export const portableMaxArchiveMembers = 1_024;
export const portableMaxManifestRows = 4_096;
const portableMaxManifestBytes = 16 * 1024 * 1024;
const portableMaxStagedFiles = portableMaxArchiveMembers - 65;

const boundedRecord = record.refine(
  (value) => Object.keys(value).length <= portableMaxManifestRows,
  `A backup can contain at most ${portableMaxManifestRows} settings.`,
);
const promptRow = z
  .object({
    id: z.string(),
    kind: z.enum(promptKinds),
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
  .object({ id: z.string(), provider: z.enum(providerIds), name: z.string(), voice_id: z.string() })
  .strict();
const stagedMeta = z
  .object({
    id: z.string(),
    stageKind: z.enum(stageKinds),
    originalFilename: z.string(),
    bytes: z.number().int().nonnegative(),
    archivePath: z
      .string()
      .min(1)
      .refine(
        (value) => value.startsWith("staging/") && safeArchiveMemberName(value),
        "A staged archive path must stay inside staging/.",
      ),
  })
  .strict();
const uploadedFontId = z.string().regex(/^uploaded-[a-f0-9]{64}$/);
const fontMeta = z
  .object({
    id: uploadedFontId,
    extension: z.enum([".ttf", ".otf"]),
    bytes: z.number().int().min(12).max(fontMaxBytes),
  })
  .strict();
const manifestSchema = z
  .object({
    version: z.literal(1),
    createdAt: z.string(),
    settings: boundedRecord,
    prompts: z.array(promptRow).max(portableMaxManifestRows),
    entries: z
      .array(libraryRow.extend({ category: z.enum(entryCategories), mode: z.enum(entryModes) }))
      .max(portableMaxManifestRows),
    voices: z.array(voiceRow).max(portableMaxManifestRows),
    templates: z.array(projectTemplateSchema).max(portableMaxManifestRows),
    fonts: z.array(fontMeta).max(64).default([]),
    staged: z.array(stagedMeta).max(portableMaxStagedFiles),
  })
  .strict();

export interface PortableDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly ids: Ids;
  readonly now: () => string;
  readonly writeStagedBytes?: (descriptor: number, bytes: Uint8Array) => void;
}

export interface PortableImportResult {
  readonly settings: number;
  readonly prompts: number;
  readonly entries: number;
  readonly voices: number;
  readonly templates: number;
  readonly fonts: number;
  readonly fontFallbacks: number;
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

interface StagedExport {
  readonly archivePath: string;
  readonly file: StagedFile;
  readonly path: string;
}

export function exportPortable(deps: PortableDeps): Uint8Array<ArrayBuffer> {
  const entries: Record<string, [Uint8Array, { readonly level: 0 }]> = {};
  const stagedPlan = planStagedExport(deps);
  const staged = stagedPlan.map(({ archivePath, file, path }) => {
    entries[archivePath] = [readStagedExport(path, file.bytes), { level: 0 }];
    return {
      id: file.id,
      stageKind: file.stageKind,
      originalFilename: file.originalFilename,
      bytes: file.bytes,
      archivePath,
    };
  });
  const storedSettings: Record<string, string> = {};
  for (const row of deps.db.prepare("SELECT key,value FROM settings ORDER BY key").all()) {
    if (typeof row.key === "string" && typeof row.value === "string")
      storedSettings[row.key] = row.value;
  }
  const settings = portableSettings(storedSettings);
  const prompts = listPrompts(deps.db).map((prompt) => ({
    id: prompt.id,
    kind: prompt.kind,
    name: prompt.name,
    body: prompt.body,
    slots: JSON.stringify(prompt.slots),
    updated_at: prompt.updatedAt,
  }));
  const entryRows = listEntries(deps.db).map((entry) => ({
    id: entry.id,
    category: entry.category,
    mode: entry.mode,
    name: entry.name,
    body: entry.body,
    slots: JSON.stringify(entry.slots),
    updated_at: entry.updatedAt,
  }));
  const voices = listVoices(deps.db).map((voice) => ({
    id: voice.id,
    provider: voice.provider,
    name: voice.name,
    voice_id: voice.voiceId,
  }));
  const templates = deps.db
    .prepare(
      "SELECT t.id,r.version,r.name,t.created_at AS createdAt,r.created_at AS updatedAt,r.document_json AS document FROM project_templates t JOIN project_template_revisions r ON r.template_id=t.id AND r.version=t.head_version ORDER BY t.id",
    )
    .all()
    .map((row) =>
      projectTemplateSchema.parse({ ...row, document: JSON.parse(String(row.document)) }),
    );
  const fonts = exportUploadedFonts(deps.paths, entries);
  const includedFonts = new Set(fonts.map((font) => font.id));
  for (const template of templates) {
    const id = template.document.form.subtitles.fontId;
    if (id.startsWith("uploaded-") && !includedFonts.has(id))
      throw new Error(`Template ${template.id} refers to an unavailable uploaded font.`);
  }
  const manifest = manifestSchema.parse({
    version: 1,
    createdAt: deps.now(),
    settings,
    prompts,
    entries: entryRows,
    voices,
    templates,
    fonts,
    staged,
  });
  validateLibraryRows(manifest);
  const manifestBytes = strToU8(JSON.stringify(manifest));
  if (manifestBytes.byteLength > portableMaxManifestBytes)
    throw new Error("The backup manifest is too large.");
  entries["manifest.json"] = [manifestBytes, { level: 0 }];
  validateExportSize(entries);
  const archive = zipSync(entries);
  if (archive.byteLength > portableMaxArchiveBytes)
    throw new Error("The portable backup is larger than 100 MiB.");
  return archive;
}

export function importPortable(deps: PortableDeps, bytes: Uint8Array): PortableImportResult {
  const archive = materializePortableArchive(bytes);
  const manifestBytes = archive["manifest.json"];
  if (manifestBytes === undefined) throw new Error("The backup has no manifest.");
  if (manifestBytes.byteLength > portableMaxManifestBytes)
    throw new Error("The backup manifest is too large.");
  const manifest = manifestSchema.parse(JSON.parse(strFromU8(manifestBytes)));
  validateManifestMembers(archive, manifest);
  validateLibraryRows(manifest);
  const settingsToImport = portableSettings(manifest.settings);
  const plannedFonts = planFontImport(deps.paths, archive, manifest.fonts);
  const staged = planStagedImport(deps, archive, manifest.staged);
  const availableFonts = new Set([
    ...installedUploadedFonts(deps.paths).map((font) => font.id),
    ...manifest.fonts.map((font) => font.id),
  ]);
  const created: string[] = [];
  try {
    return transact(deps.db, () => {
      if (plannedFonts.length > 0)
        mkdirSync(join(deps.paths.dataDir, "fonts"), { recursive: true, mode: 0o700 });
      for (const font of plannedFonts) writeImportedFile(deps, font.path, font.content, created);
      let settings = 0;
      for (const [key, value] of Object.entries(settingsToImport)) {
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
      let templateCount = 0;
      let fontFallbacks = 0;
      for (const sourceTemplate of manifest.templates) {
        const exists = deps.db
          .prepare("SELECT 1 FROM project_templates WHERE id=?")
          .get(sourceTemplate.id);
        if (exists !== undefined) continue;
        const template = repairMissingUploadedFont(sourceTemplate, availableFonts);
        if (template !== sourceTemplate) fontFallbacks += 1;
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
        templateCount += 1;
      }
      for (const file of staged) {
        writeImportedFile(deps, file.path, file.content, created);
        insertStagedFile(deps.db, file.row);
      }
      return {
        settings,
        prompts,
        entries,
        voices,
        templates: templateCount,
        fonts: plannedFonts.length,
        fontFallbacks,
        stagedFiles: staged.length,
      };
    });
  } catch (error) {
    for (const path of created.reverse()) rmSync(path, { force: true });
    throw error;
  }
}

function planStagedExport(deps: PortableDeps): readonly StagedExport[] {
  const planned: StagedExport[] = [];
  let bytes = 0;
  for (const file of stagedFiles(deps.db)) {
    if (file.state !== "staged" || file.path !== file.id) continue;
    const archivePath = `staging/${file.id}`;
    if (!safeArchiveMemberName(archivePath)) continue;
    const path = stagingPath(deps.paths, file.path);
    let stat: ReturnType<typeof lstatSync>;
    try {
      stat = lstatSync(path);
    } catch (error) {
      if (unavailable(error)) continue;
      throw error;
    }
    if (
      !stat.isFile() ||
      !Number.isSafeInteger(stat.size) ||
      stat.size <= 0 ||
      stat.size !== file.bytes
    )
      continue;
    if (planned.length >= portableMaxStagedFiles)
      throw new Error("A portable backup contains too many staged files.");
    if (stat.size > portableMaxArchiveBytes - bytes)
      throw new Error("The staged files are too large for a portable backup.");
    bytes += stat.size;
    planned.push({ archivePath, file, path });
  }
  return planned;
}

function readStagedExport(path: string, expectedBytes: number): Uint8Array {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size !== expectedBytes)
      throw new Error("A staged file changed while the portable backup was being created.");
    const content = readFileSync(descriptor);
    if (content.byteLength !== expectedBytes)
      throw new Error("A staged file changed while the portable backup was being created.");
    return content;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function validateExportSize(
  entries: Readonly<Record<string, readonly [Uint8Array, { readonly level: 0 }]>>,
): void {
  const names = Object.keys(entries);
  if (names.length > portableMaxArchiveMembers)
    throw new Error("A portable backup contains too many archive members.");
  let bytes = 0;
  for (const name of names) {
    const entry = entries[name];
    if (entry === undefined || !safeArchiveMemberName(name))
      throw new Error("A portable backup contains an invalid archive member.");
    if (entry[0].byteLength > portableMaxExpandedBytes - bytes)
      throw new Error("A portable backup contains too much file data.");
    bytes += entry[0].byteLength;
  }
  if (bytes > portableMaxArchiveBytes)
    throw new Error("A portable backup contains too much uncompressed file data.");
}

const slotsColumn = z.array(z.string());
const storedCliPath = z.string().max(cliPathMaxLength).nullable();
const storedSilenceGap = z.number().int().min(0).max(silenceGapSecondsMax);
const storedAppearance = z.enum(appearances);

function portableSettings(settings: Readonly<Record<string, string>>): Record<string, string> {
  const portable: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (key === "tutorial.session") continue;
    const parsed = storedJson(value);
    if (key === "silenceGapSeconds") storedSilenceGap.parse(parsed);
    else if (key === "appearance") storedAppearance.parse(parsed);
    else if (key.startsWith("cli.path.")) {
      const provider = providerById(z.enum(providerIds).parse(key.slice("cli.path.".length)));
      if (provider.auth !== "cli") throw new Error("A CLI path names a provider without a CLI.");
      storedCliPath.parse(parsed);
    } else throw new Error(`The backup contains an unknown setting ${key}.`);
    portable[key] = value;
  }
  return portable;
}

// The settings a full backup carries: the same known keys as above, each checked alone, so
// one this build does not know (or a damaged value) is left behind instead of refusing
// the whole export.
export function exportableSettings(
  settings: Readonly<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings)) {
    try {
      Object.assign(out, portableSettings({ [key]: value }));
    } catch {
      // Not portable: skipped.
    }
  }
  return out;
}

function storedJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("A portable setting does not contain valid JSON.");
  }
}

// The same checks a v1 import makes on library rows, for rows a full backup carries.
export function checkLibraryRows(input: {
  readonly prompts: unknown;
  readonly entries: unknown;
  readonly voices: unknown;
}): void {
  const parsed = manifestSchema.pick({ prompts: true, entries: true, voices: true }).parse(input);
  validateLibraryRows({ ...parsed, templates: [] });
}

function validateLibraryRows(
  manifest: Pick<z.infer<typeof manifestSchema>, "prompts" | "entries" | "voices" | "templates">,
): void {
  const promptIds = new Set<string>();
  const promptNames = new Set<string>();
  for (const row of manifest.prompts) {
    if (row.name !== row.name.trim() || lintPrompt(row).length > 0)
      throw new Error("The backup contains an invalid prompt.");
    uniquePortableRow(promptIds, row.id, "prompt id");
    uniquePortableRow(promptNames, `${row.kind}\0${row.name.toLowerCase()}`, "prompt name");
    validateSlots(row.body, row.slots);
  }
  const entryIds = new Set<string>();
  const entryNames = new Set<string>();
  for (const row of manifest.entries) {
    if (row.name !== row.name.trim() || lintEntry(row).length > 0)
      throw new Error("The backup contains an invalid entry.");
    uniquePortableRow(entryIds, row.id, "entry id");
    uniquePortableRow(entryNames, `${row.category}\0${row.name.toLowerCase()}`, "entry name");
    validateSlots(row.body, row.slots);
  }
  const voiceIds = new Set<string>();
  const providerVoiceIds = new Set<string>();
  for (const row of manifest.voices) {
    if (
      providerById(row.provider).family !== "tts" ||
      row.name !== row.name.trim() ||
      row.name.length === 0 ||
      row.name.length > voiceNameMax ||
      row.voice_id !== row.voice_id.trim() ||
      row.voice_id.length === 0 ||
      row.voice_id.length > voiceIdMax
    )
      throw new Error("The backup contains an invalid narration voice.");
    uniquePortableRow(voiceIds, row.id, "voice id");
    uniquePortableRow(providerVoiceIds, `${row.provider}\0${row.voice_id}`, "provider voice id");
  }
  const templateIds = new Set<string>();
  for (const template of manifest.templates)
    uniquePortableRow(templateIds, template.id, "project template id");
}

function uniquePortableRow(seen: Set<string>, key: string, field: string): void {
  if (seen.has(key)) throw new Error(`The backup repeats a ${field}.`);
  seen.add(key);
}

function validateSlots(body: string, encoded: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded);
  } catch {
    throw new Error("The backup contains invalid template slots.");
  }
  const slots = slotsColumn.parse(parsed);
  const detected = detectSlots(body);
  if (
    detected.errors.length > 0 ||
    slots.length !== detected.names.length ||
    slots.some((slot, index) => slot !== detected.names[index])
  )
    throw new Error("The backup template slots do not match its body.");
}

function materializePortableArchive(bytes: Uint8Array): Record<string, Uint8Array> {
  if (bytes.byteLength === 0 || bytes.byteLength > portableMaxArchiveBytes)
    throw new Error("The compressed backup is outside the supported size limit.");
  const directory = zipDirectory(bytes);
  const archive: Record<string, Uint8Array> = Object.create(null);
  const names = new Set<string>();
  let expandedBytes = 0;
  let members = 0;
  let failure: unknown;
  const unzip = new Unzip((file) => {
    if (failure !== undefined) {
      file.terminate();
      return;
    }
    try {
      members += 1;
      if (members > portableMaxArchiveMembers)
        throw new Error("The backup contains too many archive members.");
      if (!safeArchiveMemberName(file.name) || names.has(file.name))
        throw new Error("The backup contains an invalid or repeated archive member.");
      names.add(file.name);
      const expected = directory.get(file.name);
      if (expected === undefined)
        throw new Error("The backup local files do not match its central directory.");
      if (
        (file.size !== undefined && (!Number.isSafeInteger(file.size) || file.size < 0)) ||
        (file.originalSize !== undefined &&
          (!Number.isSafeInteger(file.originalSize) || file.originalSize < 0)) ||
        file.compression !== expected.compression ||
        (file.size !== undefined && file.size !== expected.compressedBytes) ||
        (file.originalSize !== undefined && file.originalSize !== expected.expandedBytes)
      )
        throw new Error("The backup contains invalid archive metadata.");
      const chunks: Uint8Array[] = [];
      let memberBytes = 0;
      let memberCrc = 0;
      file.ondata = (error, chunk, final) => {
        if (failure !== undefined) return;
        if (error !== null) {
          failure = error;
          file.terminate();
          return;
        }
        if (chunk.byteLength > expected.expandedBytes - memberBytes) {
          failure = new Error("The backup contains inconsistent archive metadata.");
          file.terminate();
          return;
        }
        if (chunk.byteLength > portableMaxExpandedBytes - expandedBytes) {
          failure = new Error("The backup expands beyond the supported size limit.");
          file.terminate();
          return;
        }
        expandedBytes += chunk.byteLength;
        memberBytes += chunk.byteLength;
        memberCrc = crc32(chunk, memberCrc);
        chunks.push(chunk);
        if (!final) return;
        if (memberBytes !== expected.expandedBytes || memberCrc !== expected.crc) {
          failure = new Error("The backup contains inconsistent archive metadata.");
          return;
        }
        archive[file.name] = joinChunks(chunks, memberBytes);
      };
      file.start();
    } catch (error) {
      failure = error;
      file.terminate();
    }
  });
  unzip.register(UnzipInflate);
  const compressedChunkBytes = 16 * 1024;
  for (let offset = 0; offset < bytes.byteLength; offset += compressedChunkBytes) {
    const end = Math.min(offset + compressedChunkBytes, bytes.byteLength);
    unzip.push(bytes.subarray(offset, end), end === bytes.byteLength);
    if (failure !== undefined) throw failure;
  }
  if (failure !== undefined) throw failure;
  if (Object.keys(archive).length !== members || members !== directory.size)
    throw new Error("The backup does not contain every central-directory member.");
  return archive;
}

interface ZipDirectoryMember {
  readonly compressedBytes: number;
  readonly compression: 0 | 8;
  readonly crc: number;
  readonly expandedBytes: number;
  readonly name: string;
}

function zipDirectory(bytes: Uint8Array): ReadonlyMap<string, ZipDirectoryMember> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = endOfCentralDirectory(view);
  const disk = uint16(view, eocd + 4);
  const centralDisk = uint16(view, eocd + 6);
  const diskEntries = uint16(view, eocd + 8);
  const count = uint16(view, eocd + 10);
  const centralBytes = uint32(view, eocd + 12);
  const centralOffset = uint32(view, eocd + 16);
  if (
    disk !== 0 ||
    centralDisk !== 0 ||
    diskEntries !== count ||
    count === 0xffff ||
    centralBytes === 0xffffffff ||
    centralOffset === 0xffffffff
  )
    throw new Error("The backup uses an unsupported multi-disk or ZIP64 structure.");
  if (count > portableMaxArchiveMembers)
    throw new Error("The backup contains too many archive members.");
  const centralEnd = centralOffset + centralBytes;
  if (centralOffset > eocd || centralEnd !== eocd)
    throw new Error("The backup central directory is incomplete.");

  const members = new Map<string, ZipDirectoryMember>();
  const ranges: { readonly end: number; readonly start: number }[] = [];
  let expandedBytes = 0;
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (uint32(view, cursor) !== 0x02014b50)
      throw new Error("The backup central directory is invalid.");
    const flags = uint16(view, cursor + 8);
    const compression = uint16(view, cursor + 10);
    const crc = uint32(view, cursor + 16);
    const compressedBytes = uint32(view, cursor + 20);
    const memberExpandedBytes = uint32(view, cursor + 24);
    const nameBytes = uint16(view, cursor + 28);
    const extraBytes = uint16(view, cursor + 30);
    const commentBytes = uint16(view, cursor + 32);
    const startDisk = uint16(view, cursor + 34);
    const localOffset = uint32(view, cursor + 42);
    const next = cursor + 46 + nameBytes + extraBytes + commentBytes;
    if (next > centralEnd || startDisk !== 0 || (flags & ~0x080e) !== 0)
      throw new Error("The backup central directory is invalid.");
    const name = strFromU8(
      bytes.subarray(cursor + 46, cursor + 46 + nameBytes),
      (flags & 0x0800) === 0,
    );
    if (
      !safeArchiveMemberName(name) ||
      members.has(name) ||
      (compression !== 0 && compression !== 8) ||
      (compression === 0 && compressedBytes !== memberExpandedBytes)
    )
      throw new Error("The backup contains invalid central-directory metadata.");
    if (name === "manifest.json" && memberExpandedBytes > portableMaxManifestBytes)
      throw new Error("The backup manifest is too large.");
    if (memberExpandedBytes > portableMaxExpandedBytes - expandedBytes)
      throw new Error("The backup expands beyond the supported size limit.");
    expandedBytes += memberExpandedBytes;
    const dataStart = validateLocalHeader({
      bytes,
      view,
      localOffset,
      centralOffset,
      name,
      flags,
      compression,
      crc,
      compressedBytes,
      expandedBytes: memberExpandedBytes,
    });
    const dataEnd = dataStart + compressedBytes;
    if (dataEnd > centralOffset)
      throw new Error("The backup member data crosses its central directory.");
    const memberEnd =
      (flags & 0x0008) === 0
        ? dataEnd
        : dataDescriptorEnd(view, dataEnd, centralOffset, {
            crc,
            compressedBytes,
            expandedBytes: memberExpandedBytes,
          });
    ranges.push({ start: localOffset, end: memberEnd });
    members.set(name, {
      name,
      compression,
      crc,
      compressedBytes,
      expandedBytes: memberExpandedBytes,
    });
    cursor = next;
  }
  if (cursor !== centralEnd) throw new Error("The backup central-directory size is inconsistent.");
  const ordered = ranges.toSorted((left, right) => left.start - right.start);
  if (ordered[0]?.start !== 0 || ordered.at(-1)?.end !== centralOffset)
    throw new Error("The backup contains data outside its declared archive members.");
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous === undefined || current === undefined || previous.end !== current.start)
      throw new Error("The backup archive-member spans are not contiguous.");
  }
  return members;
}

function validateLocalHeader(input: {
  readonly bytes: Uint8Array;
  readonly centralOffset: number;
  readonly compressedBytes: number;
  readonly compression: number;
  readonly crc: number;
  readonly expandedBytes: number;
  readonly flags: number;
  readonly localOffset: number;
  readonly name: string;
  readonly view: DataView;
}): number {
  const { bytes, view, localOffset } = input;
  if (localOffset + 30 > input.centralOffset || uint32(view, localOffset) !== 0x04034b50)
    throw new Error("The backup local header is missing.");
  const flags = uint16(view, localOffset + 6);
  const compression = uint16(view, localOffset + 8);
  const nameBytes = uint16(view, localOffset + 26);
  const extraBytes = uint16(view, localOffset + 28);
  const dataStart = localOffset + 30 + nameBytes + extraBytes;
  if (dataStart > input.centralOffset || flags !== input.flags || compression !== input.compression)
    throw new Error("The backup local header is invalid.");
  const name = strFromU8(
    bytes.subarray(localOffset + 30, localOffset + 30 + nameBytes),
    (flags & 0x0800) === 0,
  );
  if (name !== input.name) throw new Error("The backup local and central filenames differ.");
  if ((flags & 0x0008) === 0) {
    if (
      uint32(view, localOffset + 14) !== input.crc ||
      uint32(view, localOffset + 18) !== input.compressedBytes ||
      uint32(view, localOffset + 22) !== input.expandedBytes
    )
      throw new Error("The backup local and central metadata differ.");
  }
  return dataStart;
}

function dataDescriptorEnd(
  view: DataView,
  offset: number,
  centralOffset: number,
  expected: {
    readonly compressedBytes: number;
    readonly crc: number;
    readonly expandedBytes: number;
  },
): number {
  if (
    offset + 16 <= centralOffset &&
    uint32(view, offset) === 0x08074b50 &&
    uint32(view, offset + 4) === expected.crc &&
    uint32(view, offset + 8) === expected.compressedBytes &&
    uint32(view, offset + 12) === expected.expandedBytes
  )
    return offset + 16;
  if (
    offset + 12 <= centralOffset &&
    uint32(view, offset) === expected.crc &&
    uint32(view, offset + 4) === expected.compressedBytes &&
    uint32(view, offset + 8) === expected.expandedBytes
  )
    return offset + 12;
  throw new Error("The backup data descriptor is invalid or missing.");
}

function endOfCentralDirectory(view: DataView): number {
  if (view.byteLength < 22) throw new Error("The backup has no end-of-central-directory record.");
  const earliest = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let offset = view.byteLength - 22; offset >= earliest; offset -= 1) {
    if (
      uint32(view, offset) === 0x06054b50 &&
      offset + 22 + uint16(view, offset + 20) === view.byteLength
    )
      return offset;
  }
  throw new Error("The backup has no complete end-of-central-directory record.");
}

function uint16(view: DataView, offset: number): number {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + 2 > view.byteLength)
    throw new Error("The backup ZIP structure is truncated.");
  return view.getUint16(offset, true);
}

function uint32(view: DataView, offset: number): number {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + 4 > view.byteLength)
    throw new Error("The backup ZIP structure is truncated.");
  return view.getUint32(offset, true);
}

function joinChunks(chunks: readonly Uint8Array[], bytes: number): Uint8Array {
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

function safeArchiveMemberName(name: string): boolean {
  if (
    name.length === 0 ||
    name.length > 512 ||
    name.startsWith("/") ||
    name.includes("\\") ||
    name.includes("\0")
  )
    return false;
  return name
    .split("/")
    .every(
      (part) =>
        part.length > 0 &&
        part !== "." &&
        part !== ".." &&
        part !== "__proto__" &&
        part !== "prototype" &&
        part !== "constructor",
    );
}

function validateManifestMembers(
  archive: Readonly<Record<string, Uint8Array>>,
  manifest: z.infer<typeof manifestSchema>,
): void {
  const expected = new Set([
    "manifest.json",
    ...manifest.fonts.map((font) => fontArchivePath(font.id, font.extension)),
    ...manifest.staged.map((file) => file.archivePath),
  ]);
  if (Object.keys(archive).some((name) => !expected.has(name)))
    throw new Error("The backup contains unlisted archive members.");
}

function repairMissingUploadedFont(
  template: z.infer<typeof projectTemplateSchema>,
  available: ReadonlySet<string>,
): z.infer<typeof projectTemplateSchema> {
  const fontId = template.document.form.subtitles.fontId;
  if (!fontId.startsWith("uploaded-") || available.has(fontId)) return template;
  return {
    ...template,
    document: {
      ...template.document,
      form: {
        ...template.document.form,
        subtitles: { ...template.document.form.subtitles, fontId: "default" },
      },
    },
  };
}

interface PortableFont {
  readonly id: string;
  readonly extension: ".ttf" | ".otf";
  readonly content: Uint8Array;
}

function exportUploadedFonts(
  paths: Paths,
  archive: Record<string, [Uint8Array, { readonly level: 0 }]>,
): readonly z.infer<typeof fontMeta>[] {
  const fonts = installedUploadedFonts(paths).slice(0, 65);
  if (fonts.length > 64)
    throw new Error("A portable backup can include at most 64 uploaded fonts.");
  return fonts.map((font) => {
    archive[fontArchivePath(font.id, font.extension)] = [font.content, { level: 0 }];
    return { id: font.id, extension: font.extension, bytes: font.content.byteLength };
  });
}

export function installedUploadedFontFiles(
  paths: Paths,
): readonly { readonly name: string; readonly bytes: number }[] {
  return installedUploadedFonts(paths).map((font) => ({
    name: `${font.id}${font.extension}`,
    bytes: font.content.byteLength,
  }));
}

function installedUploadedFonts(paths: Paths): PortableFont[] {
  const root = join(paths.dataDir, "fonts");
  let names: readonly string[];
  try {
    names = readdirSync(root);
  } catch (error) {
    if (unavailable(error)) return [];
    throw error;
  }
  return names.toSorted().flatMap((name) => {
    const match = /^(uploaded-[a-f0-9]{64})(\.ttf|\.otf)$/.exec(name);
    if (!match) return [];
    const id = match[1];
    const extension = match[2];
    if (id === undefined || (extension !== ".ttf" && extension !== ".otf")) return [];
    const content = readStoredFont(join(root, name));
    return content !== undefined && validFontContent(id, extension, content)
      ? [{ id, extension, content }]
      : [];
  });
}

function planFontImport(
  paths: Paths,
  archive: Readonly<Record<string, Uint8Array>>,
  fonts: readonly z.infer<typeof fontMeta>[],
): readonly { readonly content: Uint8Array; readonly path: string }[] {
  const seen = new Set<string>();
  const installed = new Set(installedUploadedFonts(paths).map((font) => font.id));
  return fonts.flatMap((font) => {
    if (seen.has(font.id)) throw new Error(`The backup repeats uploaded font ${font.id}.`);
    seen.add(font.id);
    const content = archive[fontArchivePath(font.id, font.extension)];
    if (
      content === undefined ||
      content.byteLength !== font.bytes ||
      !validFontContent(font.id, font.extension, content)
    )
      throw new Error(`The backup has an invalid uploaded font ${font.id}.`);
    if (installed.has(font.id)) return [];
    const path = join(paths.dataDir, "fonts", `${font.id}${font.extension}`);
    if (existsSync(path))
      throw new Error(`The uploaded font destination ${font.id} is unavailable.`);
    return [{ content, path }];
  });
}

function fontArchivePath(id: string, extension: ".ttf" | ".otf"): string {
  return `fonts/${id}${extension}`;
}

export function validFontContent(
  id: string,
  extension: ".ttf" | ".otf",
  content: Uint8Array,
): boolean {
  if (content.byteLength < 12 || content.byteLength > fontMaxBytes) return false;
  if (`uploaded-${createHash("sha256").update(content).digest("hex")}` !== id) return false;
  const metadata = readFontMetadata(content);
  return metadata?.length === 1 && metadata[0]?.extension === extension;
}

function readStoredFont(path: string): Buffer | undefined {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size < 12 || stat.size > fontMaxBytes) return undefined;
    return readFileSync(descriptor);
  } catch (error) {
    if (unavailable(error)) return undefined;
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function writeImportedFile(
  deps: PortableDeps,
  path: string,
  content: Uint8Array,
  created: string[],
): void {
  const descriptor = openSync(path, "wx", 0o600);
  created.push(path);
  try {
    (deps.writeStagedBytes ?? writeFileSync)(descriptor, content);
  } finally {
    closeSync(descriptor);
  }
}

function unavailable(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    ["ENOENT", "ENOTDIR", "EACCES", "EPERM", "ELOOP"].includes(String(error.code))
  );
}

function planStagedImport(
  deps: PortableDeps,
  archive: Readonly<Record<string, Uint8Array>>,
  files: readonly z.infer<typeof stagedMeta>[],
): readonly { readonly content: Uint8Array; readonly path: string; readonly row: StagedFile }[] {
  const sourceIds = new Set<string>();
  const archivePaths = new Set<string>();
  const destinationIds = new Set<string>();
  return files.map((file) => {
    if (sourceIds.has(file.id)) throw new Error(`The backup repeats staged file ${file.id}.`);
    if (archivePaths.has(file.archivePath))
      throw new Error(`The backup repeats archive member ${file.archivePath}.`);
    sourceIds.add(file.id);
    archivePaths.add(file.archivePath);
    const content = archive[file.archivePath];
    if (content === undefined)
      throw new Error(`The backup is missing staged file ${file.originalFilename}.`);
    if (content.byteLength !== file.bytes)
      throw new Error(`The backup has an invalid size for staged file ${file.originalFilename}.`);
    const id = deps.ids.next();
    const path = stagingPath(deps.paths, id);
    if (
      destinationIds.has(id) ||
      existsSync(path) ||
      deps.db.prepare("SELECT 1 FROM staged_files WHERE id=?").get(id) !== undefined
    )
      throw new Error("The backup could not reserve a unique staged-file destination.");
    destinationIds.add(id);
    return {
      content,
      path,
      row: {
        id,
        stageKind: file.stageKind,
        path: id,
        originalFilename: file.originalFilename,
        bytes: content.byteLength,
        state: "staged",
        createdAt: deps.now(),
      },
    };
  });
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
