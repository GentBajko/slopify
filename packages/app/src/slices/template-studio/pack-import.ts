import { rmSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { transact } from "../../kernel/db/tx.js";
import { detectSlots } from "../admission/substitute.js";
import type { Entry } from "../library/model.js";
import { nameMax } from "../library/model.js";
import { entryByName, insertEntry } from "../library/repo.js";
import type { LibrarySnapshot } from "../library/snapshot.js";
import { renamedIn } from "../library/used-by.js";
import { freeTemplateName, placePrompt } from "../onboarding/install.js";
import type { PlayDraftDocument } from "../play-drafts/schema.js";
import type { TemplateDeps } from "../project-templates/model.js";
import { createTemplate } from "../project-templates/service.js";
import { listVoices } from "../settings/repo.js";
import type { StudioResult } from "./model.js";
import {
  looksSecret,
  type PackManifest,
  type PackSampleRole,
  packFormat,
  packFormatVersion,
  packLimits,
  packManifestSchema,
  packSampleFile,
} from "./pack.js";
import { packSamplesDir, writePackSamples } from "./pack-samples.js";

// Import pack: a pack someone exported, checked before anything is written, then made into a
// new template of its own that no schedule runs until it is looked over in the studio and
// marked ready. Its prompts and intros join the Library (a name already taken by other text
// comes in as "<name> (2)"); its voice is used only when Settings → Voices has it.

export interface ImportedPack {
  readonly templateId: string;
  readonly name: string;
  // Library items the pack added, and those that came in under another name.
  readonly added: number;
  readonly renamed: readonly { readonly from: string; readonly to: string }[];
  // False when Settings → Voices has no voice with the pack's voice ID: the studio's Voice
  // check says so and how to fix it.
  readonly voiceKnown: boolean;
  readonly samples: number;
}

const refuse = (message: string): StudioResult<never> => ({
  ok: false,
  reason: "invalid-input",
  message,
});

const notAPack =
  "This file isn't a template pack Slopify can read. Choose the .zip that Export pack in a template's studio made.";

interface Unpacked {
  readonly manifest: PackManifest;
  readonly files: ReadonlyMap<string, Uint8Array>;
}

// Every check that needs nothing written: a zip, small enough, with a manifest of this format
// and version, no keys, and every sample it names inside it.
export function readPack(bytes: Uint8Array): StudioResult<Unpacked> {
  if (bytes.byteLength > packLimits.uploadBytes)
    return refuse(
      `This pack is larger than ${String(packLimits.uploadBytes / 1024 / 1024)} MB, more than a template pack ever is. Export it again from the template's studio, or ask whoever made it to.`,
    );
  let oversized: string | undefined;
  let unexpected: string | undefined;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter: (file) => {
        if (file.name.endsWith("/")) return false;
        const known = file.name === "manifest.json" || packSampleFile.test(file.name);
        if (!known) {
          unexpected ??= file.name;
          return false;
        }
        const limit =
          file.name === "manifest.json" ? packLimits.manifestBytes : packLimits.sampleBytes;
        if (file.originalSize > limit) {
          oversized ??= file.name;
          return false;
        }
        return true;
      },
    });
  } catch {
    return refuse(notAPack);
  }
  if (oversized !== undefined)
    return refuse(
      `This pack's ${oversized} is larger than a template pack allows, so nothing was imported. Export the pack again from the template's studio.`,
    );
  if (unexpected !== undefined)
    return refuse(
      `This pack holds a file a template pack never has (${unexpected.slice(0, 120)}), so nothing was imported. Export the pack again from the template's studio.`,
    );
  const raw = entries["manifest.json"];
  if (raw === undefined)
    return refuse(
      "This zip has no manifest.json, so it isn't a template pack. Choose the .zip that Export pack in a template's studio made.",
    );
  const text = strFromU8(raw);
  if (looksSecret(text))
    return refuse(
      "This pack holds what looks like an API key or a login token, so Slopify didn't import it: keys never travel in a pack. Ask whoever made it to remove it from the template and export it again.",
    );
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return refuse(
      "This pack's manifest.json isn't readable JSON; the file may be damaged. Export the pack again from the template's studio.",
    );
  }
  const head = json as { readonly format?: unknown; readonly formatVersion?: unknown };
  if (typeof json !== "object" || json === null || head.format !== packFormat)
    return refuse(notAPack);
  if (typeof head.formatVersion === "number" && head.formatVersion > packFormatVersion)
    return refuse(
      `This pack was made by a newer Slopify (pack format ${String(head.formatVersion)}). Update Slopify in Settings → About, then import it again.`,
    );
  const parsed = packManifestSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where =
      issue === undefined ? "" : ` (${issue.path.join(".") || "manifest"}: ${issue.message})`;
    return refuse(
      `This pack's manifest isn't one Slopify can use${where.slice(0, 300)}. It may be damaged or edited by hand; export it again from the template's studio.`,
    );
  }
  const files = new Map<string, Uint8Array>();
  for (const sample of parsed.data.samples) {
    const file = entries[sample.file];
    if (file === undefined)
      return refuse(
        `This pack names a sample (${sample.file}) it doesn't hold; the file may be damaged. Export the pack again from the template's studio.`,
      );
    files.set(sample.file, file);
  }
  return { ok: true, value: { manifest: parsed.data, files } };
}

type SnapshotPrompt = LibrarySnapshot["prompts"][number];
type SnapshotEntry = LibrarySnapshot["entries"][number];

function placeEntry(
  deps: Pick<TemplateDeps, "db" | "ids">,
  row: SnapshotEntry,
  at: string,
): { readonly name: string; readonly added: boolean } {
  for (let n = 1; ; n += 1) {
    const suffix = n === 1 ? "" : ` (${String(n)})`;
    const candidate = `${row.name.slice(0, nameMax - suffix.length).trimEnd()}${suffix}`;
    const taken = entryByName(deps.db, row.category, candidate);
    if (taken?.body === row.body) return { name: taken.name, added: false };
    if (taken !== undefined) continue;
    const entry: Entry = {
      id: deps.ids.next(),
      category: row.category,
      mode: row.mode,
      name: candidate,
      body: row.body,
      slots: detectSlots(row.body).names,
      updatedAt: at,
    };
    insertEntry(deps.db, entry);
    return { name: candidate, added: true };
  }
}

// The pack's Library items placed in this Library, and the document naming each by the name it
// has here.
function placeLibrary(
  deps: Pick<TemplateDeps, "db" | "ids">,
  document: PlayDraftDocument,
  at: string,
): {
  readonly document: PlayDraftDocument;
  readonly added: number;
  readonly renamed: readonly { readonly from: string; readonly to: string }[];
} {
  const snapshot = document.librarySnapshot ?? { prompts: [], entries: [] };
  let form: unknown = document.form;
  let added = 0;
  const renamed: { from: string; to: string }[] = [];
  const prompts: SnapshotPrompt[] = [];
  for (const row of snapshot.prompts) {
    const placed = placePrompt(deps, row.kind, row.name, row.body, at);
    if (placed.added) added += 1;
    if (placed.prompt.name !== row.name) {
      renamed.push({ from: row.name, to: placed.prompt.name });
      form =
        renamedIn(form, { item: "prompt", kind: row.kind, name: row.name }, placed.prompt.name) ??
        form;
    }
    prompts.push({ ...row, id: placed.prompt.id, name: placed.prompt.name });
  }
  const entries: SnapshotEntry[] = [];
  for (const row of snapshot.entries) {
    const placed = placeEntry(deps, row, at);
    if (placed.added) added += 1;
    if (placed.name !== row.name) {
      renamed.push({ from: row.name, to: placed.name });
      form =
        renamedIn(form, { item: "entry", category: row.category, name: row.name }, placed.name) ??
        form;
    }
    entries.push({ ...row, name: placed.name });
  }
  return {
    document: {
      ...document,
      form: form as PlayDraftDocument["form"],
      librarySnapshot: { prompts, entries },
    },
    added,
    renamed,
  };
}

export function importPack(deps: TemplateDeps, bytes: Uint8Array): StudioResult<ImportedPack> {
  const read = readPack(bytes);
  if (!read.ok) return read;
  const { manifest, files } = read.value;
  const templateId = deps.uuid();
  const at = deps.clock.now().toISOString();
  let made: StudioResult<ImportedPack>;
  try {
    made = transact(deps.db, (): StudioResult<ImportedPack> => {
      const placed = placeLibrary(deps, manifest.template.document, at);
      const { channelId: _channel, templateSource: _source, ...document } = placed.document;
      const name = freeTemplateName(deps, manifest.template.name);
      const created = createTemplate(deps, {
        id: templateId,
        name,
        document: { ...document, fontUpload: null },
      });
      if (!created.ok)
        throw new PackRefused(
          created.reason === "missing-prompt"
            ? "This pack's template names a prompt or intro/outro the pack doesn't carry, so it can't be made here. Ask whoever made it to export it again."
            : "Slopify couldn't make a template from this pack. Import it again; if it fails again, use Download diagnostics in Settings and report it.",
        );
      const audio = created.value.document.form.audio;
      const voiceKnown =
        audio.voice === "" ||
        listVoices(deps.db).some(
          (voice) => voice.provider === audio.provider && voice.voiceId === audio.voice,
        );
      return {
        ok: true,
        value: {
          templateId,
          name,
          added: placed.added,
          renamed: placed.renamed,
          voiceKnown,
          samples: manifest.samples.length,
        },
      };
    });
  } catch (error) {
    if (error instanceof PackRefused) return refuse(error.message);
    throw error;
  }
  if (!made.ok) return made;
  // The samples are only to look at: written once the template is in, a failure to write them
  // leaves the template as it is, without them.
  try {
    writePackSamples(
      deps.paths,
      templateId,
      manifest.samples.flatMap((sample) => {
        const body = files.get(sample.file);
        return body === undefined
          ? []
          : [
              {
                file: sample.file.slice("samples/".length),
                role: sample.role as PackSampleRole,
                name: sample.name,
                body,
              },
            ];
      }),
    );
  } catch (error) {
    rmSync(packSamplesDir(deps.paths, templateId), { recursive: true, force: true });
    deps.log.write("warn", "template-studio.pack", {
      detail: `The samples of the imported pack ${templateId} weren't kept: ${error instanceof Error ? error.message : String(error)}`,
    });
    return { ok: true, value: { ...made.value, samples: 0 } };
  }
  return made;
}

class PackRefused extends Error {}
