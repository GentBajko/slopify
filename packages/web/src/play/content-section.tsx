import type { Entry } from "@app/slices/library/model.js";
import type { ReactElement } from "react";
import { articleTaskOf } from "./article-task";
import type { RailProps } from "./rail-frame";
import { ArticleRail, ResearchRail } from "./stage-rails";
import { TextGenerationIn } from "./text-generation";

// The Article row of Create: where the text comes from and, when the AI writes it, the prompt
// it writes from; who writes it, when writing the article or research is the first thing that
// needs a writer (`text-generation.tsx`); and research.
export function ContentSection(
  props: RailProps & {
    readonly entries: readonly Entry[];
  },
): ReactElement {
  const { form } = props;
  return (
    <>
      <ArticleRail {...props} titled={false} />
      {props.withoutService === true ? null : <TextGenerationIn {...props} section="article" />}
      {form.sources.article === "off" ? (
        <p className="m-0 py-4 text-small text-ink-2">
          No text: for a set of images or a thumbnail made from prompts. Narration, the PDF and
          anything else that reads the article stay off.
        </p>
      ) : form.sources.article === "provide" || articleTaskOf(form) === "adapt" ? null : (
        <ResearchRail {...props} />
      )}
    </>
  );
}
