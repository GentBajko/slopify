import type { ProviderChoice } from "../admission/model.js";
import { projectById } from "../admission/repo.js";
import { usesShortMode } from "../admission/short-mode.js";
import { promptById } from "../library/repo.js";
import type { DraftResult, DraftView } from "../play-drafts/model.js";
import type { PlayDraftDocument } from "../play-drafts/schema.js";
import { createDraft } from "../play-drafts/service.js";
import { templateById } from "../project-templates/repo.js";
import { freshTemplateDraft } from "../project-templates/setup.js";
import { installPack, type PackInstallDeps } from "./install.js";
import { type StarterPack, starterPacks, starterSet } from "./packs.js";
import { readPackRecords } from "./state.js";
import { packTemplate } from "./template.js";

// "The first thing you make is a short; the long video comes second." Once a short is done,
// its next action opens Play on a long video about the same topic: the starter pack the short
// was made from (its template, installed if it was not yet), the topic typed in, and the text,
// image and voice providers the short used, since those are known to work on this machine.

export type FullVideoResult =
  | { readonly ok: true; readonly value: DraftView }
  | { readonly ok: false; readonly reason: "not-found" | "not-short" }
  | Extract<DraftResult<DraftView>, { ok: false }>;

// The pack whose short script the short was written from. A short made without a pack, or
// whose pack's prompts were since renamed or removed, is the starter set's.
export function shortPack(deps: Pick<PackInstallDeps, "db">, articlePrompt: string): StarterPack {
  const records = readPackRecords(deps.db);
  for (const pack of starterPacks) {
    const id = records[pack.id]?.prompts.shortScript;
    if (id !== undefined && promptById(deps.db, id)?.name === articlePrompt) return pack;
  }
  return starterSet;
}

export function fullVideoDraft(
  deps: PackInstallDeps,
  input: { readonly projectId: string; readonly draftId: string },
): FullVideoResult {
  const project = projectById(deps.db, input.projectId);
  if (project === undefined) return { ok: false, reason: "not-found" };
  const config = project.config;
  if (!usesShortMode(config)) return { ok: false, reason: "not-short" };
  const topic = config.values.topic?.trim() || project.title;
  const pack = shortPack(deps, config.articlePrompt ?? "");
  const document = packDocument(deps, pack);
  if (document === undefined) return { ok: false, reason: "not-found" };
  const provider = (
    choice: ProviderChoice | undefined,
    fallback: PlayDraftDocument["form"]["llm"],
  ) =>
    choice === undefined || fallback.provider !== ""
      ? fallback
      : {
          provider: choice.provider,
          model: choice.model,
          ...(choice.thinking === undefined ? {} : { thinking: choice.thinking }),
        };
  const form = document.form;
  return createDraft(deps, {
    id: input.draftId,
    document: {
      ...document,
      form: {
        ...form,
        title: project.title,
        values: { ...form.values, topic },
        llm: provider(config.llm, form.llm),
        images: provider(config.images, form.images),
        audio:
          config.audio === undefined
            ? form.audio
            : {
                ...form.audio,
                provider: config.audio.provider,
                model: config.audio.model,
                voice: config.audio.voice,
              },
      },
    },
  });
}

// A pack's own template, as Templates → Apply to Play opens it. The starter set has no long
// video prompt of its own and no template, so it is its settings without one saved.
function packDocument(deps: PackInstallDeps, pack: StarterPack): PlayDraftDocument | undefined {
  const withTemplate = pack.id !== starterSet.id;
  const installed = installPack(deps, pack.id, { template: withTemplate });
  if (!installed.ok) return undefined;
  const { templateId } = installed.value;
  if (!withTemplate || templateId === null)
    return packTemplate(pack, installed.value.prompts, installed.value.voice ?? pack.voice.voiceId);
  const template = templateById(deps.db, templateId);
  if (template === undefined) return undefined;
  return freshTemplateDraft(deps, template.document, {
    id: template.id,
    version: template.version,
  });
}
