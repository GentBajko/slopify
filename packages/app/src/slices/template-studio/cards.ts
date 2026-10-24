import type { DatabaseSync } from "node:sqlite";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import { projectExists } from "../admission/repo.js";
import type { PlayDraftDocument } from "../play-drafts/schema.js";
import { topicKeywords } from "../project-templates/one-off.js";
import { templateById, templateSummaries } from "../project-templates/repo.js";
import { currentRevisionId } from "../revisions/repo.js";
import { getRevisionView } from "../revisions/view.js";
import { listVoices } from "../settings/repo.js";
import { packSamples } from "./pack-samples.js";
import { sampleOf } from "./repo.js";
import type { TemplateCard } from "./schema.js";
import { templateSchedules } from "./service.js";

// Templates: what each template makes, so a template can be picked without opening it. Its
// still is the sample's thumbnail (or first picture), else a picture its pack came with; its
// facts are read from its setup (`templateCardSchema` in schema.ts is what the page reads).

export interface CardDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly log: Log;
}

const formats = new Set(["16:9", "9:16", "1:1"]);

export function cardFacts(
  document: PlayDraftDocument,
  voices: readonly { readonly provider: string; readonly voiceId: string; readonly name: string }[],
): Omit<TemplateCard, "id" | "still" | "schedules"> {
  const { form } = document;
  const voiced = form.sources.audio === "generate" && form.audio.voice.trim() !== "";
  const saved = voices.find(
    (one) => one.provider === form.audio.provider && one.voiceId === form.audio.voice,
  );
  const words = Number.parseInt(document.expectedWords, 10);
  const shorts = Number.parseInt(form.shorts?.count ?? "0", 10);
  return {
    format: formats.has(form.format) ? (form.format as TemplateCard["format"]) : "16:9",
    video: form.sources.video !== "off" && form.sources.images !== "off",
    words: form.sources.article === "off" || !Number.isFinite(words) ? null : Math.max(0, words),
    voice: voiced
      ? {
          provider: form.audio.provider,
          voiceId: form.audio.voice,
          name: saved?.name.trim() ? saved.name : form.audio.voice,
        }
      : null,
    captions: form.subtitles.mode,
    shorts: form.shorts?.enabled === true && Number.isFinite(shorts) ? Math.max(0, shorts) : 0,
    pdf: form.sources.document === "generate",
    asks: [...topicKeywords(form.title)],
  };
}

// The sample's thumbnail or first picture, as the project's file route serves it.
function sampleStill(deps: CardDeps, templateId: string): string | null {
  const sample = sampleOf(deps.db, templateId);
  if (sample === undefined || !projectExists(deps.db, sample.projectId)) return null;
  const revisionId = currentRevisionId(deps.db, sample.projectId);
  if (revisionId === undefined) return null;
  const revision = getRevisionView(
    {
      db: deps.db,
      paths: deps.paths,
      log: deps.log,
      ids: { next: () => "" },
      clock: { now: () => new Date(), sleep: async () => undefined },
    },
    sample.projectId,
    revisionId,
  );
  const shown = (role: string) =>
    revision?.outputs.find(
      (row) => row.output.role === role && row.selected && row.available && row.state === "ready",
    );
  const row = shown("thumbnail") ?? shown("image");
  return row === undefined
    ? null
    : `/files/${encodeURIComponent(sample.projectId)}/revisions/${encodeURIComponent(revisionId)}/${encodeURIComponent(row.recordId)}`;
}

function packStill(deps: CardDeps, templateId: string): string | null {
  const samples = packSamples(deps.paths, templateId);
  const picture =
    samples.find((one) => one.role === "thumbnail") ??
    samples.find((one) => one.role === "picture");
  return picture === undefined
    ? null
    : `/api/template-studio/${templateId}/pack-samples/${picture.file}`;
}

export function templateCards(deps: CardDeps): readonly TemplateCard[] {
  const voices = listVoices(deps.db);
  return templateSummaries(deps.db).flatMap((summary) => {
    const template = templateById(deps.db, summary.id);
    if (template === undefined) return [];
    return [
      {
        id: template.id,
        still: sampleStill(deps, template.id) ?? packStill(deps, template.id),
        ...cardFacts(template.document, voices),
        schedules: templateSchedules(deps.db, template.id).length,
      },
    ];
  });
}
