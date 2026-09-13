import { titleMax } from "@app/slices/admission/rules.js";
import type { Field } from "@app/slices/admission/substitute.js";
import type { Entry } from "@app/slices/library/model.js";
import type { ReactElement } from "react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { keywordOrigins } from "./admission";
import { KeywordBlock } from "./keywords";
import { ModelPicker, ProviderPicker } from "./pickers";
import type { RailProps } from "./rail-frame";
import { ArticleRail, ResearchRail } from "./stage-rails";
import { needsLlm } from "./state";
import { ThinkingPicker } from "./thinking";
export function ContentSection(
  props: RailProps & {
    readonly fields: readonly Field[];
    readonly entries: readonly Entry[];
    readonly onLibrary: (path: "/prompts" | "/settings") => void;
  },
): ReactElement {
  const { form, problem, update, fields, entries, onLibrary } = props;
  const id = useId();
  const prompt = props.prompts.find(
    (item) => item.kind === "article" && item.name === form.articlePrompt,
  );
  return (
    <>
      <div className="mt-7">
        <Label htmlFor={id} className="mb-2">
          Project title
        </Label>
        <Input
          id={id}
          data-play-field="title"
          value={form.title}
          maxLength={titleMax}
          aria-invalid={problem("title") !== undefined}
          onChange={(event) => update({ title: event.target.value })}
        />
        {problem("title") ? <p className="text-small text-red">{problem("title")}</p> : null}
      </div>
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
      <KeywordBlock
        fields={fields}
        origins={keywordOrigins({
          form,
          prompts: props.prompts,
          entries,
          silenceGapSeconds: props.silenceGapSeconds,
        })}
        values={form.values}
        problem={problem}
        onChange={(name, value) => update({ values: { ...form.values, [name]: value } })}
      />
      {needsLlm(form, entries) ? (
        <section className="border-y border-line py-6">
          <h3 className="mb-4 text-lg font-semibold">Text generation</h3>
          <div className="grid grid-cols-1 gap-4 min-[700px]:grid-cols-2">
            <ProviderPicker
              field="llm.provider"
              label="LLM"
              family="llm"
              providers={props.providers}
              value={form.llm.provider}
              problem={problem("llm") ?? problem("llm.provider")}
              onPick={(provider) => update({ llm: { provider, model: "" } })}
            />
            <ModelPicker
              field="llm.model"
              label="Text model"
              provider={form.llm.provider}
              value={form.llm.model}
              problem={problem("llm.model")}
              onPick={(model) => update({ llm: { ...form.llm, model } })}
            />
            <ThinkingPicker choice={form.llm} onChange={(llm) => update({ llm })} />
          </div>
          <p className="mt-3 text-small text-ink3">
            Shared by generated article, research, thumbnail wording and generated entries when
            enabled.
          </p>
          <Button variant="ghost" onClick={() => onLibrary("/settings")}>
            Settings
          </Button>
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
