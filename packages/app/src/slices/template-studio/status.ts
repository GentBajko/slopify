import type { PlayDraftDocument } from "../play-drafts/schema.js";
import type { FreeSample, FreeSamplesView } from "./free.js";
import {
  type SectionState,
  sectionLabel,
  type TemplateSection,
  templateSections,
} from "./model.js";
import type { MonthlyCost } from "./schedule-sample.js";

export interface SectionStatus {
  readonly id: TemplateSection;
  readonly label: string;
  readonly state: SectionState;
  readonly sentence: string;
}

// What a section's sample is made from, by the step that makes it; null for a section whose
// sample never depends on a source (the schedule).
function sourceOf(document: PlayDraftDocument, section: TemplateSection): string | null {
  const { form } = document;
  switch (section) {
    case "subject":
      return form.sources.research;
    case "script":
      return form.sources.article;
    case "voice":
      return form.sources.audio;
    case "pictures":
      return form.sources.images;
    case "thumbnail":
      return form.sources.thumbnail;
    case "video":
      return form.sources.video;
    case "document":
      return form.sources.document ?? "off";
    case "shorts":
      return form.shorts?.enabled === true && form.sources.video !== "off" ? "generate" : "off";
    case "upload":
      return form.sources.video;
    case "reviews": {
      const on =
        (form.checkpoints?.length ?? 0) > 0 ||
        Object.values(form.reviews?.stages ?? {}).some((stage) => stage.mode !== "off");
      return on ? "generate" : "off";
    }
    case "schedule":
      return null;
  }
}

const offSentence: Readonly<Record<TemplateSection, string>> = {
  subject: "Research is off: the script is written from the topic alone.",
  script: "The script is off.",
  voice: "The narration is off.",
  pictures: "Pictures are off.",
  thumbnail: "The thumbnail is off.",
  video: "The video is off.",
  shorts: "Shorts are off.",
  document: "The PDF document is off.",
  reviews: "No review or checkpoint is on.",
  upload: "No video, so there is no upload pack.",
  schedule: "",
};

// Each section's state before any sample: off, provided at run time (no sample, never blocks
// Mark ready), or waiting for its first sample. Samples made since replace these (`free` and,
// later, the paid samples' versions).
export function baseStatuses(
  document: PlayDraftDocument,
  made: Partial<Readonly<Record<TemplateSection, SectionStatus>>> = {},
): readonly SectionStatus[] {
  return templateSections.map((id): SectionStatus => {
    const label = sectionLabel[id];
    const source = sourceOf(document, id);
    if (source === "off") return { id, label, state: "off", sentence: offSentence[id] };
    if (source === "provide")
      return {
        id,
        label,
        state: "provided",
        sentence: "Provided at run time: you add the file to each video, so there is no sample.",
      };
    return (
      made[id] ?? {
        id,
        label,
        state: "stale",
        sentence:
          "No sample yet: this section's sample is made by a provider, which the studio doesn't do yet.",
      }
    );
  });
}

// What the free samples say of their sections. The voice's own sample is a paid one; until it
// is made, Voice shows the loudness before and after.
export function madeStatuses(
  free: FreeSamplesView,
  schedules: number,
  cost: MonthlyCost | null,
): Partial<Readonly<Record<TemplateSection, SectionStatus>>> {
  const of = (id: TemplateSection, sample: FreeSample): SectionStatus | undefined =>
    sample.state === "off"
      ? undefined
      : { id, label: sectionLabel[id], state: sample.state, sentence: sample.sentence };
  const made: Partial<Record<TemplateSection, SectionStatus>> = {};
  const video = of("video", free.video);
  if (video !== undefined) made.video = video;
  const voice = of("voice", free.loudness);
  if (voice !== undefined) made.voice = voice;
  const document = of("document", free.document);
  if (document !== undefined) made.document = document;
  made.reviews = {
    id: "reviews",
    label: sectionLabel.reviews,
    state: "current",
    sentence: "Where a run stops, and who answers each stop.",
  };
  made.schedule =
    schedules === 0
      ? {
          id: "schedule",
          label: sectionLabel.schedule,
          state: "off",
          sentence: "No schedule runs this template yet. Make one in Calendar → Schedules.",
        }
      : {
          id: "schedule",
          label: sectionLabel.schedule,
          state: cost?.problem === null || cost === null ? "current" : "stale",
          sentence:
            cost?.problem ??
            "The next runs with the titles their topics fill, and the cost a month.",
        };
  return made;
}
