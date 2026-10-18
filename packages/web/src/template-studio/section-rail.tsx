import type { SectionState, TemplateSection } from "@app/slices/template-studio/model.js";
import type { StudioView } from "@app/slices/template-studio/schema.js";
import type { ReactElement } from "react";
import { Rail, RailButton, RailLink } from "@/components/kit/rail";
import { Lamp, type Tone } from "@/components/kit/status";

export const stateTone: Readonly<Record<SectionState, Tone>> = {
  current: "done",
  making: "running",
  waiting: "waiting",
  "needs-fix": "failed",
  stale: "info",
  off: "off",
  provided: "off",
};

export const stateWord: Readonly<Record<SectionState, string>> = {
  current: "Current",
  making: "Making",
  waiting: "Waiting",
  "needs-fix": "Needs a fix",
  stale: "No current sample",
  off: "Off",
  provided: "Provided",
};

// One section of a studio's rail: a project template's (`TemplateSection`) or a design
// template's (Picture, Text layout, Formats, Schedule), with its sample's state.
export interface RailSection<Id extends string> {
  readonly id: Id;
  readonly label: string;
  readonly state: SectionState;
}

const lampOf = (state: SectionState): ReactElement => <Lamp tone={stateTone[state]} />;
const wordOf = (state: SectionState): ReactElement => (
  <span className="sr-only">{stateWord[state]}</span>
);

// The rail every template studio shows, whatever the template makes: its sections in order,
// each with its sample's state as a lamp and (for a screen reader) a word. A section is a link
// when the studio keeps it in the URL, a button when it keeps it in the page.
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
    <Rail label="Template sections">
      {sections.map((section) => {
        const icon = lampOf(section.state);
        const meta = wordOf(section.state);
        const link = linkOf?.(section.id);
        return link === undefined ? (
          <RailButton
            key={section.id}
            current={section.id === current}
            icon={icon}
            meta={meta}
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
            icon={icon}
            meta={meta}
          >
            {section.label}
          </RailLink>
        );
      })}
    </Rail>
  );
}

// A project template's sections in pipeline order, each a link that keeps the section in the URL.
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
