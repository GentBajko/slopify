import type { SectionState, TemplateSection } from "@app/slices/template-studio/model.js";
import type { StudioView } from "@app/slices/template-studio/schema.js";
import type { ReactElement } from "react";
import { Rail, RailButton, RailLink } from "@/components/kit/rail";
import type { Tone } from "@/components/kit/status";

export const stateTone: Readonly<Record<SectionState, Tone>> = {
  current: "done",
  making: "running",
  waiting: "waiting",
  "needs-fix": "failed",
  stale: "info",
  off: "off",
  provided: "off",
};

// A section's sample in words.
const stateWord: Readonly<Record<SectionState, string>> = {
  current: "Sample ready",
  making: "Making",
  waiting: "Waiting",
  "needs-fix": "Needs a fix",
  stale: "No sample yet",
  off: "Off",
  provided: "You add it",
};

// One section of a studio's rail: a project template's (`TemplateSection`) or a design
// template's (Picture, Text layout, Formats, Schedule), with its sample's state.
export interface RailSection<Id extends string> {
  readonly id: Id;
  readonly label: string;
  readonly state: SectionState;
}

// The sections that never have a sample: what they set is all there is to see (where a run
// pauses, which schedules run it), so once they are on they say "On", not "Sample ready".
const sampleless: ReadonlySet<string> = new Set(["reviews", "schedule"]);

// A section's state in words, the same in the rail and over the sample.
export function sectionWord(section: {
  readonly id: string;
  readonly state: SectionState;
}): string {
  return section.state === "current" && sampleless.has(section.id)
    ? "On"
    : stateWord[section.state];
}

// The rail marks a section only when it says something: a sample made, being made, waiting or
// failed, a section switched off. "No sample yet" is every section's starting point, so it
// draws no lamp at all rather than a column of identical dots; the sample head says it.
function standing(section: {
  readonly id: string;
  readonly state: SectionState;
}): { readonly tone: Tone; readonly state: string } | undefined {
  return section.state === "stale"
    ? undefined
    : { tone: stateTone[section.state], state: sectionWord(section) };
}

// The rail every template studio shows, whatever the template makes: its sections in order,
// each with its sample's state as a lamp beside its word. A section is a link when the studio
// keeps it in the URL, a button when it keeps it in the page.
export function StudioRail<Id extends string>({
  sections,
  current,
  linkOf,
  onSelect,
}: {
  readonly sections: readonly RailSection<Id>[];
  readonly current: Id;
  readonly linkOf?: (id: Id) => {
    readonly to: string;
    readonly search: Readonly<Record<string, string>>;
  };
  readonly onSelect?: (id: Id) => void;
}): ReactElement {
  return (
    <Rail label="Template sections" className="sl-studio-rail">
      {sections.map((section) => {
        const mark = standing(section) ?? {};
        const link = linkOf?.(section.id);
        return link === undefined ? (
          <RailButton
            key={section.id}
            current={section.id === current}
            {...mark}
            onClick={() => onSelect?.(section.id)}
          >
            {section.label}
          </RailButton>
        ) : (
          <RailLink
            key={section.id}
            to={link.to}
            search={link.search}
            resetScroll={false}
            current={section.id === current}
            {...mark}
          >
            {section.label}
          </RailLink>
        );
      })}
    </Rail>
  );
}

// A project template's sections in run order, each a link that keeps the section in the URL.
export function SectionRail({
  templateId,
  sections,
  current,
}: {
  readonly templateId: string;
  readonly sections: StudioView["sections"];
  readonly current: TemplateSection;
}): ReactElement {
  return (
    <StudioRail
      sections={sections}
      current={current}
      linkOf={(id) => ({ to: `/templates/${templateId}`, search: { section: id } })}
    />
  );
}
