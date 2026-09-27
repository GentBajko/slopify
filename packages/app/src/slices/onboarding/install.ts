import { transact } from "../../kernel/db/tx.js";
import { detectSlots } from "../admission/substitute.js";
import { nameMax, type Prompt, type PromptKind } from "../library/model.js";
import { insertPrompt, promptById, promptByName } from "../library/repo.js";
import type { TemplateDeps } from "../project-templates/model.js";
import { templateById, templateSummaries } from "../project-templates/repo.js";
import { createTemplate } from "../project-templates/service.js";
import { insertVoice, listVoices } from "../settings/repo.js";
import { type PackPromptKey, packById, type StarterPack } from "./packs.js";
import { type PackRecord, readPackRecords, writePackRecord } from "./state.js";
import { packTemplate } from "./template.js";

export type PackInstallDeps = TemplateDeps;

export interface InstalledPack {
  readonly packId: string;
  // False when every item was already installed and nothing was written.
  readonly added: boolean;
  // The library name each prompt has, which differs from the pack's when that name was taken.
  readonly prompts: Readonly<Partial<Record<PackPromptKey, string>>>;
  readonly templateId: string | null;
  readonly voice: string | null;
}

export type PackInstallResult =
  | { readonly ok: true; readonly value: InstalledPack }
  | { readonly ok: false; readonly reason: "not-found" };

// Installs a pack into the library. Idempotent: an item the pack installed before, and that
// still exists, is kept as it is, even if it was edited since. A user's own prompt, voice or
// template is never overwritten: a prompt with the pack's name and the pack's exact text is
// used as it is, and any other one with that name makes the pack's copy come in as
// "<name> (2)". `template: false` installs the prompts and the voice only (what the
// 60-second short needs).
export function installPack(
  deps: PackInstallDeps,
  packId: string,
  options: { readonly template: boolean } = { template: true },
): PackInstallResult {
  const pack = packById(packId);
  if (pack === undefined) return { ok: false, reason: "not-found" };
  return transact(deps.db, () => {
    const before = readPackRecords(deps.db)[pack.id];
    let added = false;
    const at = deps.clock.now().toISOString();
    const prompts: Record<string, string> = {};
    const names: Partial<Record<PackPromptKey, string>> = {};
    for (const prompt of pack.prompts) {
      const kept = before?.prompts[prompt.key];
      const existing = kept === undefined ? undefined : promptById(deps.db, kept);
      if (existing !== undefined) {
        prompts[prompt.key] = existing.id;
        names[prompt.key] = existing.name;
        continue;
      }
      const placed = placePrompt(deps, prompt.kind, prompt.name, prompt.body, at);
      added ||= placed.added;
      prompts[prompt.key] = placed.prompt.id;
      names[prompt.key] = placed.prompt.name;
    }
    const voice = placeVoice(deps, pack, before);
    added ||= voice.added;
    let template = before?.template;
    if (options.template && (template === undefined || !templateById(deps.db, template))) {
      const id = deps.uuid();
      const created = createTemplate(deps, {
        id,
        name: freeTemplateName(deps, `${pack.name} starter`),
        document: packTemplate(pack, names, voice.voiceId),
      });
      if (!created.ok)
        throw new Error(
          `Slopify hit an internal error (the ${pack.name} pack's template was refused: ${created.reason}). Try again; if it happens again, use Download diagnostics in Settings and report it.`,
        );
      template = id;
      added = true;
    }
    const record: PackRecord = {
      installedAt: before?.installedAt ?? at,
      prompts,
      voice: voice.id,
      ...(template === undefined ? {} : { template }),
    };
    writePackRecord(deps.db, pack.id, record);
    return {
      ok: true,
      value: {
        packId: pack.id,
        added,
        prompts: names,
        templateId: template ?? null,
        voice: voice.voiceId,
      },
    };
  });
}

function placePrompt(
  deps: PackInstallDeps,
  kind: PromptKind,
  name: string,
  body: string,
  at: string,
): { readonly prompt: Prompt; readonly added: boolean } {
  for (let n = 1; ; n += 1) {
    const suffix = n === 1 ? "" : ` (${String(n)})`;
    const candidate = `${name.slice(0, nameMax - suffix.length).trimEnd()}${suffix}`;
    const taken = promptByName(deps.db, kind, candidate);
    if (taken?.body === body) return { prompt: taken, added: false };
    if (taken !== undefined) continue;
    const prompt: Prompt = {
      id: deps.ids.next(),
      kind,
      name: candidate,
      body,
      slots: detectSlots(body).names,
      updatedAt: at,
    };
    insertPrompt(deps.db, prompt);
    return { prompt, added: true };
  }
}

// The suggested voice as a saved voice, so Play's voice list offers it. One the user already
// saved under the same voice ID is used as it is, name and all.
function placeVoice(
  deps: PackInstallDeps,
  pack: StarterPack,
  before: PackRecord | undefined,
): { readonly id: string; readonly voiceId: string; readonly added: boolean } {
  const voices = listVoices(deps.db);
  const same = voices.find(
    (voice) =>
      (before?.voice !== undefined && voice.id === before.voice) ||
      (voice.provider === pack.voice.provider && voice.voiceId === pack.voice.voiceId),
  );
  if (same !== undefined) return { id: same.id, voiceId: same.voiceId, added: false };
  const id = deps.ids.next();
  insertVoice(deps.db, {
    id,
    provider: pack.voice.provider,
    name: pack.voice.name,
    voiceId: pack.voice.voiceId,
  });
  return { id, voiceId: pack.voice.voiceId, added: true };
}

function freeTemplateName(deps: PackInstallDeps, name: string): string {
  const taken = new Set(templateSummaries(deps.db).map((row) => row.name.toLowerCase()));
  for (let n = 1; ; n += 1) {
    const candidate = n === 1 ? name : `${name} (${String(n)})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}
