import type { Entry } from "@app/slices/library/model.js";
import type { ReactElement } from "react";
import { Button } from "@/components/kit/button";
import { articleKind } from "./article-kind";
import type { RailProps } from "./rail-frame";
import { ArticleRail, ResearchRail } from "./stage-rails";
import { TextGenerationIn } from "./text-generation";
// The Article row of Play: the article's source and prompt, the text generation when writing
// the article or research is the first thing that needs it (`text-generation.tsx`), and research.
export function ContentSection(
  props: RailProps & {
    readonly entries: readonly Entry[];
    readonly onLibrary: (path: "/prompts" | "/settings") => void;
  },
): ReactElement {
  const { form, onLibrary } = props;
  const prompt = props.prompts.find(
    (item) => item.kind === articleKind(form) && item.name === form.articlePrompt,
  );
  return (
    <>
      <ArticleRail {...props} titled={false} />
      {form.sources.article === "generate" ? (
        <div className="flex flex-wrap items-start gap-3 py-3">
          {prompt ? (
            <details className="min-w-0 flex-1">
              <summary
                data-play-field="articlePrompt.preview"
                className="cursor-pointer py-2 text-small text-accent-ink"
              >
                View prompt
              </summary>
              <pre className="whitespace-pre-wrap break-words py-3 font-sans text-body text-ink-2">
                {prompt.body}
              </pre>
            </details>
          ) : (
            <p className="text-small text-ink-2">
              {props.prompts.some((item) => item.kind === articleKind(form))
                ? `Choose a saved ${articleKind(form)} prompt.`
                : `No ${articleKind(form)} prompts saved. Create a prompt to begin.`}
            </p>
          )}
          <Button variant="quiet" size="small" onClick={() => onLibrary("/prompts")}>
            Create prompt
          </Button>
        </div>
      ) : (
        <p className="py-3 text-small text-ink-3">
          {form.provided.article.trim() ? form.provided.article.trim().split(/\s+/).length : 0}{" "}
          words · {form.provided.article.length} characters
        </p>
      )}
      <TextGenerationIn {...props} section="article" onSettings={() => onLibrary("/settings")} />
      {form.sources.article === "provide" ? (
        <p className="py-4 text-small text-ink-3">
          Research is Off because the article is provided.
        </p>
      ) : (
        <ResearchRail {...props} />
      )}
    </>
  );
}
