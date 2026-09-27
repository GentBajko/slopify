import type { Entry } from "@app/slices/library/model.js";
import type { ReactElement } from "react";
import { Button } from "@/components/kit/button";
import { SectionHead } from "@/components/kit/section-head";
import { articleKind } from "./article-kind";
import { ModelPicker, ProviderPicker } from "./pickers";
import type { RailProps } from "./rail-frame";
import { ArticleRail, ResearchRail } from "./stage-rails";
import { needsLlm } from "./state";
import { ThinkingPicker } from "./thinking";
// The Article row of Play: the article's source and prompt, the text generation every
// generated text shares, and research.
export function ContentSection(
  props: RailProps & {
    readonly entries: readonly Entry[];
    readonly onLibrary: (path: "/prompts" | "/settings") => void;
  },
): ReactElement {
  const { form, problem, update, entries, onLibrary } = props;
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
                className="cursor-pointer py-2 text-small text-run-text"
              >
                View prompt
              </summary>
              <pre className="whitespace-pre-wrap break-words py-3 font-sans text-body text-ink2">
                {prompt.body}
              </pre>
            </details>
          ) : (
            <p className="text-small text-ink2">
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
        <p className="py-3 text-small text-ink3">
          {form.provided.article.trim() ? form.provided.article.trim().split(/\s+/).length : 0}{" "}
          words · {form.provided.article.length} characters
        </p>
      )}
      {needsLlm(form, entries) ? (
        <section aria-label="Text generation" className="border-y border-line py-4">
          <SectionHead as="h3" title="Text generation" info="play.text-generation" className="pb-3">
            <Button variant="quiet" size="small" onClick={() => onLibrary("/settings")}>
              Settings
            </Button>
          </SectionHead>
          <div className="grid grid-cols-1 gap-4 min-[700px]:grid-cols-2">
            <ProviderPicker
              field="llm.provider"
              label="LLM"
              tip="play.llm.provider"
              family="llm"
              providers={props.providers}
              value={form.llm.provider}
              problem={
                problem("llm.provider") ?? (form.llm.provider === "" ? problem("llm") : undefined)
              }
              onPick={(provider) => update({ llm: { provider, model: "" } })}
            />
            <ModelPicker
              field="llm.model"
              label="Text model"
              tip="play.llm.model"
              provider={form.llm.provider}
              value={form.llm.model}
              problem={
                problem("llm.model") ??
                (form.llm.provider !== "" && problem("llm") ? "Pick a text model." : undefined)
              }
              onPick={(model) => update({ llm: { ...form.llm, model } })}
            />
            <ThinkingPicker choice={form.llm} onChange={(llm) => update({ llm })} />
          </div>
        </section>
      ) : null}
      {form.sources.article === "provide" ? (
        <p className="py-4 text-small text-ink3">
          Research is Off because the article is provided.
        </p>
      ) : (
        <ResearchRail {...props} />
      )}
    </>
  );
}
