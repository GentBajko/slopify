import type { LlmUse } from "@app/slices/admission/rules.js";
import type { Entry } from "@app/slices/library/model.js";
import type { ReactElement } from "react";
import { Button } from "@/components/kit/button";
import { SectionHead } from "@/components/kit/section-head";
import { ModelPicker, ProviderPicker } from "./pickers";
import type { RailProps } from "./rail-frame";
import { llmUsesOf } from "./state";
import { ThinkingPicker } from "./thinking";

// The one text model a run uses for everything it asks an LLM for. It sits in the section of
// the first thing that needs it (`llmUses`): Article when the article or research is written,
// Narration when only the narration's preparation needs it (an audiobook's speakers worked out
// from a provided book, say), Outputs when only the extras do. It says what it is used for.
export function TextGeneration({
  form,
  providers,
  problem,
  update,
  uses,
  onSettings,
}: Pick<RailProps, "form" | "providers" | "problem" | "update"> & {
  readonly uses: readonly LlmUse[];
  readonly onSettings: () => void;
}): ReactElement {
  const labels = [...new Set(uses.map((use) => use.label))];
  const used =
    labels.length <= 1
      ? (labels[0] ?? "")
      : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1) ?? ""}`;
  return (
    <section aria-label="Text generation" className="border-y border-line py-4">
      <SectionHead
        as="h3"
        title="Text generation"
        meta={`Used for ${used}.`}
        info="play.text-generation"
        className="pb-3"
      >
        <Button variant="quiet" size="small" onClick={onSettings}>
          Settings
        </Button>
      </SectionHead>
      <div className="sl-fields">
        <ProviderPicker
          field="llm.provider"
          label="LLM"
          tip="play.llm.provider"
          family="llm"
          providers={providers}
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
  );
}

// The picker, in `section` only when that is where the model sits: the section of the first
// thing the run asks an LLM for.
export function TextGenerationIn({
  section,
  entries,
  ...props
}: Pick<RailProps, "form" | "providers" | "problem" | "update"> & {
  readonly section: LlmUse["section"];
  readonly entries: readonly Entry[];
  readonly onSettings: () => void;
}): ReactElement | null {
  const uses = llmUsesOf(props.form, entries);
  return uses[0]?.section === section ? <TextGeneration {...props} uses={uses} /> : null;
}
