import type { Entry } from "@app/slices/library/model.js";
import type { ReactElement } from "react";
import { InfoTip } from "@/components/kit/info-tip";
import { Button } from "@/components/ui/button";
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
    (item) => item.kind === "article" && item.name === form.articlePrompt,
  );
  return (
    <>
      <ArticleRail {...props} />
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
              {props.prompts.some((item) => item.kind === "article")
                ? "Choose a saved article prompt."
                : "No article prompts saved. Create a prompt to begin."}
            </p>
          )}
          <Button variant="ghost" onClick={() => onLibrary("/prompts")}>
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
        <section className="border-y border-line py-4">
          <div className="mb-3 flex items-center gap-1">
            <h3 className="text-row font-semibold">Text generation</h3>
            <InfoTip label="text generation">
              <p>
                Shared by generated article, research, thumbnail wording, generated entries and
                Narration Preparation when enabled.
              </p>
            </InfoTip>
            <span className="flex-1" />
            <Button variant="ghost" onClick={() => onLibrary("/settings")}>
              Settings
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 min-[700px]:grid-cols-2">
            <ProviderPicker
              field="llm.provider"
              label="LLM"
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
