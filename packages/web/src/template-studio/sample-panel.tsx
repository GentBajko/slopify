import type { StudioView } from "@app/slices/template-studio/schema.js";
import type { ReactElement } from "react";
import { SectionHead } from "@/components/kit/section-head";
import { Status } from "@/components/kit/status";
import { stateTone, stateWord } from "./section-rail";

// Beside a section's settings: what its sample is now.
export function SamplePanel({
  section,
}: {
  readonly view: StudioView;
  readonly section: StudioView["sections"][number];
}): ReactElement {
  return (
    <section aria-label={`${section.label} sample`} className="flex flex-col gap-3">
      <SectionHead
        title="Sample"
        as="h3"
        className="pb-0"
        status={<Status tone={stateTone[section.state]}>{stateWord[section.state]}</Status>}
      />
      <p className="m-0 text-small text-ink-2">{section.sentence}</p>
    </section>
  );
}
