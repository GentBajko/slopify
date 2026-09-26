import type { StageKind } from "@app/kernel/pipeline.js";
import type { ProjectSummary, RunConfig, Stage } from "@app/slices/admission/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { stageName, stageNames, summaryOf } from "./summary.js";

// The page shows five sections for the run's seven stages. Research only feeds the article and
// the thumbnail is one more picture, so neither earns a section of its own: research is a tab on
// Article and the thumbnail sits at the top of Images. The stages themselves are unchanged; this
// only decides where each one is shown.

export type SectionKind = Exclude<StageKind, "research" | "thumbnail">;

export const sectionKinds: readonly SectionKind[] = [
  "article",
  "audio",
  "images",
  "video",
  "document",
];

const companions: Readonly<Partial<Record<SectionKind, StageKind>>> = {
  article: "research",
  images: "thumbnail",
};

export interface Section {
  readonly kind: SectionKind;
  readonly stage: Stage;
  // The stage shown inside this section, and only when the run includes it.
  readonly companion?: Stage;
}

export function sectionOf(kind: StageKind): SectionKind {
  return kind === "research" ? "article" : kind === "thumbnail" ? "images" : kind;
}

export function sectionsOf(stages: readonly Stage[]): readonly Section[] {
  return sectionKinds.flatMap((kind) => {
    const stage = stages.find((one) => one.kind === kind);
    if (stage === undefined) return [];
    const companionKind = companions[kind];
    const companion = stages.find((one) => one.kind === companionKind && one.state !== "skipped");
    return [companion === undefined ? { kind, stage } : { kind, stage, companion }];
  });
}

// The stage whose lamp, state word and meter the section wears. A companion that needs the
// reader (failed, canceled or at work) speaks for the section, so a research failure is seen on
// Article even though the article itself is still waiting.
export function shownStage(section: Section): Stage {
  const both = [section.stage, section.companion].filter((one): one is Stage => one !== undefined);
  for (const state of ["failed", "canceled", "running"] as const) {
    const hit = both.find((one) => one.state === state);
    if (hit !== undefined) return hit;
  }
  if (section.stage.state === "skipped" && section.companion !== undefined)
    return section.companion;
  return section.stage;
}

// The stage a section is named and drawn after. Images switched off with a thumbnail still on
// reads as the Thumbnail section, so the one picture the run makes is not filed under a heading
// that says "switched off".
export function sectionLead(section: Section): StageKind {
  return section.stage.state === "skipped" && section.companion !== undefined
    ? section.companion.kind
    : section.kind;
}

export function sectionName(section: Section, config: RunConfig): string {
  const lead = sectionLead(section);
  return lead === section.kind ? stageName(section.kind, config) : stageNames[lead];
}

export function sectionSummary(
  section: Section,
  outputs: readonly Output[],
  project: ProjectSummary,
): string {
  const shown = shownStage(section);
  const summary = summaryOf(shown, outputs, project);
  return shown === section.companion && section.stage.state !== "skipped"
    ? `${stageNames[shown.kind]}: ${summary}`
    : summary;
}
