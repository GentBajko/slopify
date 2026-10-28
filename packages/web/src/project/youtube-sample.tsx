import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { isSample, readSample, sampleKey } from "@/onboarding/api";

// The bundled samples are read-only and never go to YouTube (the server refuses their release,
// link and upload writes): the YouTube section and Copy for YouTube Studio read them, and say
// so in one sentence where a form would be.

// Whether this project is one of the bundled samples; false until that is known.
export function useSampleProject(projectId: string): boolean {
  const { api } = useApp();
  const sample = useQuery({ queryKey: sampleKey, queryFn: () => readSample(api) });
  return isSample(sample.data, projectId);
}

// "The sample isn't on YouTube and can't be.", in place of the Release dates and the YouTube
// links. Make my own copy is the title row's one button; it is named here, not drawn twice.
export function SampleNote(): ReactElement {
  return (
    <section aria-label="Release and YouTube links" className="flex flex-col items-start gap-2">
      <h3 className="m-0 text-title-3 font-semibold text-ink">Release and YouTube links</h3>
      <p className="m-0 max-w-[var(--measure)] text-ink-2">
        This sample isn't on YouTube and can't be. Press Make my own copy at the top to give your
        copy a release date, post it and keep its links, or to edit and write this text again.
      </p>
    </section>
  );
}
