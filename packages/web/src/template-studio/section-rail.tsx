import type { SectionState, TemplateSection } from "@app/slices/template-studio/model.js";
import type { StudioView } from "@app/slices/template-studio/schema.js";
import type { ReactElement } from "react";
import { Rail, RailLink } from "@/components/kit/rail";
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

// The studio's sections in pipeline order, each with its sample's state as a lamp and a word.
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
    <Rail label="Template sections">
      {sections.map((section) => (
        <RailLink
          key={section.id}
          to={`/templates/${templateId}`}
          search={{ section: section.id }}
          resetScroll={false}
          current={section.id === current}
          icon={<Lamp tone={stateTone[section.state]} />}
          meta={<span className="sr-only">{stateWord[section.state]}</span>}
        >
          {section.label}
        </RailLink>
      ))}
    </Rail>
  );
}
