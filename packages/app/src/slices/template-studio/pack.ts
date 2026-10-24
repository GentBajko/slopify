import { readFile } from "node:fs/promises";
import type { DatabaseSync } from "node:sqlite";
import { strToU8, type Zippable, zipSync } from "fflate";
import { z } from "zod";
import type { Log } from "../../kernel/log.js";
import { redact } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import { projectExists } from "../admission/repo.js";
import { playDraftDocumentSchema } from "../play-drafts/schema.js";
import { templateById } from "../project-templates/repo.js";
import { templateNameMax } from "../project-templates/schema.js";
import { templateSetup } from "../project-templates/setup.js";
import { findRevisionDownload } from "../revisions/downloads.js";
import { currentRevisionId } from "../revisions/repo.js";
import { getRevisionView } from "../revisions/view.js";
import { listVoices } from "../settings/repo.js";
import { runnableVersion } from "./gate.js";
import type { StudioResult } from "./model.js";
import { gatesOf, sampleOf } from "./repo.js";

// A template pack: a template set up in the studio, as one zip someone else imports and looks
// at before using it. It carries the version marked ready (its prompts' and intros' text, the
// voice it picks, the Look, the PDF theme) and a few of its sample's files. Never a key, a
// login or anything else of this computer's: a pack is made to be shared.

export const packFormat = "slopify-template-pack";
export const packFormatVersion = 1;

// ceiling: a pack is a few sample files and a manifest; a bigger upload is refused before it is
// read, and each entry is refused by its stated size before it is unpacked.
export const packLimits = {
  uploadBytes: 30 * 1024 * 1024,
  manifestBytes: 2 * 1024 * 1024,
  sampleBytes: 6 * 1024 * 1024,
  samples: 6,
  pictures: 4,
} as const;

export const packSampleRoles = ["thumbnail", "picture", "narration"] as const;
export type PackSampleRole = (typeof packSampleRoles)[number];

const sampleTypes = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
} as const;
export type PackSampleExtension = keyof typeof sampleTypes;
export const packSampleFile = /^samples\/([a-z0-9-]{1,40})\.(png|jpg|jpeg|webp|mp3|m4a|wav)$/;

export function packSampleType(file: string): string | undefined {
  const extension = packSampleFile.exec(file)?.[2] as PackSampleExtension | undefined;
  return extension === undefined ? undefined : sampleTypes[extension];
}

export const packManifestSchema = z
  .object({
    format: z.literal(packFormat),
    formatVersion: z.literal(packFormatVersion),
    exportedAt: z.string().max(40),
    slopifyVersion: z.string().max(40),
    template: z
      .object({
        name: z.string().trim().min(1).max(templateNameMax),
        version: z.number().int().positive(),
        document: playDraftDocumentSchema,
      })
      .strict(),
    // The voice the template picks, as the exporter's Settings → Voices names it.
    voice: z
      .object({
        provider: z.string().min(1).max(100),
        voiceId: z.string().min(1).max(200),
        name: z.string().max(200),
      })
      .strict()
      .nullable(),
    samples: z
      .array(
        z
          .object({
            file: z.string().regex(packSampleFile),
            role: z.enum(packSampleRoles),
            name: z.string().max(200),
          })
          .strict(),
      )
      .max(packLimits.samples),
  })
  .strict();
export type PackManifest = z.infer<typeof packManifestSchema>;

// Whether text holds what looks like an API key or a bearer token (`kernel/log.ts`'s filter).
export function looksSecret(text: string): boolean {
  return redact(text) !== text;
}

export interface PackSampleFile {
  readonly role: PackSampleRole;
  readonly name: string;
  readonly path: string;
  readonly bytes: number;
  readonly extension: PackSampleExtension;
}

export interface PackExportDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly log: Log;
  readonly clock: { readonly now: () => Date };
  readonly version: string;
}

const extensionOf = (path: string): PackSampleExtension | undefined => {
  const extension = path.split(".").pop()?.toLowerCase();
  return extension !== undefined && Object.hasOwn(sampleTypes, extension)
    ? (extension as PackSampleExtension)
    : undefined;
};

// The sample's thumbnail, up to four pictures and its narration, as its project holds them now.
// A file too big for a pack is left out.
export function sampleFilesOf(deps: PackExportDeps, templateId: string): readonly PackSampleFile[] {
  const sample = sampleOf(deps.db, templateId);
  if (sample === undefined || !projectExists(deps.db, sample.projectId)) return [];
  const revisionId = currentRevisionId(deps.db, sample.projectId);
  if (revisionId === undefined) return [];
  const view = getRevisionView(
    { ...deps, ids: { next: () => "" }, clock: { now: deps.clock.now, sleep: async () => {} } },
    sample.projectId,
    revisionId,
  );
  if (view === undefined) return [];
  const wanted: readonly { readonly role: PackSampleRole; readonly roles: readonly string[] }[] = [
    { role: "thumbnail", roles: ["thumbnail"] },
    { role: "picture", roles: ["image"] },
    { role: "narration", roles: ["audio_export", "audio_mp3", "audio_body"] },
  ];
  const files: PackSampleFile[] = [];
  for (const { role, roles } of wanted) {
    const limit = role === "picture" ? packLimits.pictures : 1;
    let taken = 0;
    for (const wantedRole of roles)
      for (const row of view.outputs) {
        if (taken >= limit) break;
        if (!row.selected || !row.available || row.state !== "ready") continue;
        if (row.output.role !== wantedRole) continue;
        const found = findRevisionDownload(deps, sample.projectId, revisionId, row.recordId);
        if (!found.ok) continue;
        const extension = extensionOf(found.download.path);
        if (extension === undefined || found.download.bytes > packLimits.sampleBytes) continue;
        taken += 1;
        files.push({
          role,
          name: row.output.path.split("/").pop() ?? `${role}.${extension}`,
          path: found.download.path,
          bytes: found.download.bytes,
          extension,
        });
      }
  }
  return files;
}

const slug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "template";

export interface ExportedPack {
  readonly filename: string;
  readonly bytes: Uint8Array;
  readonly version: number;
}

// Export pack: the newest version its schedules may run (marked ready, carried, or saved
// before the studio), with the Library's text of each prompt it names as it is now.
export async function exportPack(
  deps: PackExportDeps,
  templateId: string,
  samples: (templateId: string) => readonly PackSampleFile[] = (id) => sampleFilesOf(deps, id),
): Promise<StudioResult<ExportedPack>> {
  const head = templateById(deps.db, templateId);
  if (head === undefined)
    return {
      ok: false,
      reason: "not-found",
      message:
        "This template no longer exists; it may have been deleted. Go to Templates to see your templates.",
    };
  // What its schedules run: the newest version, or once it was first approved for schedules,
  // the newest approved one.
  const runs = runnableVersion(gatesOf(deps.db, templateId), head.version);
  const template = runs === undefined ? undefined : templateById(deps.db, templateId, runs);
  if (template === undefined)
    return {
      ok: false,
      reason: "not-ready",
      message:
        "No version of this template is approved for schedules, so there is nothing to put in the file: it carries what its schedules run. Approve a version in Edit template, then export it again.",
    };
  const setup = templateSetup(deps, template.document);
  if (!setup.ok)
    return {
      ok: false,
      reason: "invalid-input",
      message: `Version ${String(template.version)} names a prompt or intro/outro that was deleted, so its text can't go into the file. Choose another in Edit template, Save, then export it again.`,
    };
  const document = setup.value;
  const { audio } = document.form;
  const saved = listVoices(deps.db).find(
    (voice) => voice.provider === audio.provider && voice.voiceId === audio.voice,
  );
  const files = samples(templateId);
  const named = files.map((file, index) => ({
    ...file,
    entry: `samples/${file.role}-${String(index + 1)}.${file.extension}`,
  }));
  const manifest: PackManifest = {
    format: packFormat,
    formatVersion: packFormatVersion,
    exportedAt: deps.clock.now().toISOString(),
    slopifyVersion: deps.version.slice(0, 40),
    template: { name: template.name, version: template.version, document },
    voice:
      audio.provider === "" || audio.voice === ""
        ? null
        : { provider: audio.provider, voiceId: audio.voice, name: saved?.name ?? audio.voice },
    samples: named.map((file) => ({ file: file.entry, role: file.role, name: file.name })),
  };
  const json = JSON.stringify(manifest, null, 2);
  if (looksSecret(json))
    return {
      ok: false,
      reason: "invalid-input",
      message:
        "Something in this template looks like an API key or a login token (a keyword's value or a prompt's text), so no file was made: it is meant to be shared. Remove it in Edit template, Save, then export it again.",
    };
  const entries: Zippable = { "manifest.json": [strToU8(json), { level: 6 }] };
  for (const file of named) {
    // Pictures and audio are compressed already: stored as they are.
    entries[file.entry] = [new Uint8Array(await readFile(file.path)), { level: 0 }];
  }
  return {
    ok: true,
    value: {
      filename: `${slug(template.name)}.slopify-template.zip`,
      bytes: zipSync(entries),
      version: template.version,
    },
  };
}
