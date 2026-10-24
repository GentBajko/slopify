import { type SetupSection, setupSectionNames } from "../project-templates/setup-sections.js";

// Template studio (4.0, "Edit template" on screen): a template is set up once, section by
// section, with live samples on a hidden project, then approved for its schedules. Not to be
// confused with `slices/studio`, which is the YouTube Studio pack and its extension.

// In pipeline order: the studio's rail shows them so.
export const templateSections = [
  "subject",
  "script",
  "voice",
  "pictures",
  "video",
  "thumbnail",
  "shorts",
  "document",
  "reviews",
  "upload",
  "schedule",
] as const;
export type TemplateSection = (typeof templateSections)[number];

// Each section's place in the one list of setup sections Create, Edit template and a project's
// settings share. The ids stay as they were, so every saved address still opens its section.
export const setupSectionOf: Readonly<Record<TemplateSection, SetupSection>> = {
  subject: "topic",
  script: "article",
  voice: "narration",
  pictures: "images",
  video: "video",
  thumbnail: "thumbnail",
  shorts: "shorts",
  document: "pdf",
  reviews: "checks",
  upload: "youtube",
  schedule: "schedule",
};

export const sectionLabel: Readonly<Record<TemplateSection, string>> = Object.fromEntries(
  templateSections.map((id) => [id, setupSectionNames[setupSectionOf[id]]]),
) as Record<TemplateSection, string>;

// What a section's sample is: made for the current version, being made, queued behind another,
// failed with a fix, made for an older version, switched off, or provided by the user at run time.
export const sectionStates = [
  "current",
  "making",
  "waiting",
  "needs-fix",
  "stale",
  "off",
  "provided",
] as const;
export type SectionState = (typeof sectionStates)[number];

// A version's gate. A version without one was never checked in the studio.
export const gateStates = ["legacy", "ready", "carried"] as const;
export type GateState = (typeof gateStates)[number];

export interface VersionGate {
  readonly version: number;
  readonly state: GateState;
  // The version a carried gate was copied from.
  readonly carriedFrom: number | null;
}

export const sampleVersionStates = [
  "queued",
  "making",
  "done",
  "failed",
  "skipped",
  "held",
] as const;
export type SampleVersionState = (typeof sampleVersionStates)[number];

export const sampleJobKinds = ["save", "topic", "full-script", "bakeoff", "free"] as const;
export type SampleJobKind = (typeof sampleJobKinds)[number];

export type StudioRefusal =
  | "not-found"
  | "invalid-input"
  | "conflict"
  | "cost-changed"
  | "over-budget"
  | "not-ready";

export type StudioResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: StudioRefusal; readonly message: string };

// The topic every template's sample is made about until the user picks another.
export const fallbackSampleTopic = "The history of the lighthouse";
