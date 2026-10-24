import type { PlayDraftDocument } from "../play-drafts/schema.js";
import type { FreeSample, FreeSamplesView } from "./free.js";
import {
  type SectionState,
  sectionLabel,
  type TemplateSection,
  templateSections,
} from "./model.js";
import type { MonthlyCost } from "./schedule-sample.js";
import { affectedSections } from "./sections.js";

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
    // Text the template itself holds is in every run, and in its sample (`scope.ts`).
    case "subject":
      return heldText(form.sources.research, form.provided.research);
    case "script":
      return heldText(form.sources.article, form.provided.article);
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

function heldText(source: string, text: string): string {
  return source === "provide" && text.trim() !== "" ? "held" : source;
}

const offSentence: Readonly<Record<TemplateSection, string>> = {
  subject: "Research is off: the script is written from the topic alone.",
  script: "The article is off.",
  voice: "The narration is off.",
  pictures: "Images are off.",
  thumbnail: "The thumbnail is off.",
  video: "The video is off.",
  shorts: "Shorts are off.",
  document: "The PDF is off.",
  reviews: "No pause or AI check is on.",
  upload: "No video, so there is no YouTube description or post.",
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
        sentence: "Make sample shows what this section makes, about the sample topic.",
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
    sentence: "Where a run pauses for you, and which AI checks run.",
  };
  made.schedule =
    schedules === 0
      ? {
          id: "schedule",
          label: sectionLabel.schedule,
          state: "off",
          sentence: "No schedule runs this template yet.",
        }
      : {
          id: "schedule",
          label: sectionLabel.schedule,
          state: cost?.problem === null || cost === null ? "current" : "stale",
          sentence:
            cost?.problem ??
            (cost !== null && cost.paused.schedules === schedules
              ? `${schedules === 1 ? "1 paused schedule uses" : `${String(schedules)} paused schedules use`} this template: its next runs once resumed, and what they would cost a month.`
              : "The next runs with the titles their topics fill, and the cost a month."),
        };
  return made;
}

// The sections a paid sample shows: what the providers make. The video, the PDF and the
// schedule keep their free samples; the voice shows the loudness until a paid one is made.
export const paidSections = [
  "subject",
  "script",
  "voice",
  "pictures",
  "thumbnail",
  "shorts",
  "upload",
] as const satisfies readonly TemplateSection[];

export interface PaidStatusInput {
  readonly headVersion: number;
  readonly headDocument: PlayDraftDocument;
  // Each version's paid sample, newest first (`sampleVersions`).
  readonly versions: readonly import("./repo.js").SampleVersion[];
  // A version's setup, to say which sections changed since the last sample.
  readonly documentOf: (version: number) => PlayDraftDocument | undefined;
  // This template's paid sample job is being made now.
  readonly running: boolean;
  // Another template's sample is being made, so this one's waits.
  readonly busyElsewhere: boolean;
}

// What each paid section's sample is for the current version: made for it, being made,
// waiting (with why and what to press), failed (with the step's own sentence), or made for an
// older version and outdated by a change since. A section the change since the last made
// sample never touched keeps that sample, current.
export function paidStatuses(
  input: PaidStatusInput,
): Partial<Readonly<Record<TemplateSection, SectionStatus>>> {
  const row = input.versions.find((one) => one.templateVersion === input.headVersion);
  const done = input.versions.find(
    (one) => one.state === "done" && one.templateVersion <= input.headVersion,
  );
  const madeFrom = done === undefined ? undefined : input.documentOf(done.templateVersion);
  const changed = new Set(
    madeFrom === undefined || done === undefined
      ? paidSections
      : affectedSections(madeFrom, input.headDocument),
  );
  const status = (id: TemplateSection, state: SectionState, sentence: string): SectionStatus => ({
    id,
    label: sectionLabel[id],
    state,
    sentence,
  });
  const made: Partial<Record<TemplateSection, SectionStatus>> = {};
  if (row === undefined && done === undefined) return made;
  for (const id of paidSections) {
    if (row?.state === "done") {
      made[id] = status(id, "current", `Made for version ${String(input.headVersion)}.`);
      continue;
    }
    if (!changed.has(id) && done !== undefined) {
      made[id] = status(
        id,
        "current",
        `Made for version ${String(done.templateVersion)}; nothing it shows changed since.`,
      );
      continue;
    }
    const pending = row?.state === "queued" || row?.state === "making";
    if (pending && (input.running || row?.state === "making"))
      made[id] = status(id, "making", `Making the sample of version ${String(input.headVersion)}.`);
    else if (pending)
      made[id] = status(
        id,
        "waiting",
        input.busyElsewhere
          ? "Waits for another template's sample to finish."
          : "Queued: it starts in a moment.",
      );
    else if (row?.state === "held")
      made[id] = status(id, "waiting", row.heldReason ?? "Waiting. Press Make sample to make it.");
    else if (row?.state === "failed")
      made[id] = status(
        id,
        "needs-fix",
        row.heldReason ?? "The sample failed. Press Make sample to try again.",
      );
    else
      made[id] = status(
        id,
        "stale",
        done === undefined
          ? "Make sample shows what this section makes, about the sample topic."
          : `Changed since the sample of version ${String(done.templateVersion)}. Press Make sample to see it again.`,
      );
  }
  return made;
}
