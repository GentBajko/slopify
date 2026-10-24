import type { ReactElement } from "react";
import { ButtonLink } from "@/components/kit/link";
import { SectionHead } from "@/components/kit/section-head";
import { SetupChecklist } from "@/components/welcome";
import type { FirstRunView } from "@/onboarding/api";

// Home before the person has a project of their own: what a video needs on this computer, each
// part with its state and its fix (the welcome's checklist), and the one button that makes the
// first video. The button wears the lime only once nothing is missing; until then the fixes are
// the next thing to do, and Create says the same thing under its own button.
export function FirstVideo({
  firstRun,
}: {
  readonly firstRun: FirstRunView | undefined;
}): ReactElement {
  const ready = firstRun !== undefined && firstRun.needs.gaps.length === 0;
  return (
    <section aria-label="Your first video" className="flex flex-col gap-3">
      <SectionHead title="Your first video" meta="What a video needs on this computer" />
      <SetupChecklist />
      <div>
        <ButtonLink to="/play" variant={ready ? "primary" : "secondary"}>
          Make your first video
        </ButtonLink>
      </div>
    </section>
  );
}
