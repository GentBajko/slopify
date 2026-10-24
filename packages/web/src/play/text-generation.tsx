import type { LlmUse } from "@app/slices/admission/rules.js";
import type { Entry, Prompt } from "@app/slices/library/model.js";
import type { ReactElement } from "react";
import type { RailProps } from "./rail-frame";
import { ServiceGroup } from "./service-group";
import { llmUsesOf } from "./state";
import { ThinkingPicker } from "./thinking";

// The one text model a run uses for everything it asks an AI to write. It sits in the section
// of the first thing that needs it (`llmUses`): Article when the article or research is
// written, Narration when only the narration's preparation needs it (an audiobook's speakers
// worked out from a provided book, say), Outputs when only the extras do. It says what it is
// used for.
export function TextGeneration({
  form,
  providers,
  problem,
  update,
  uses,
}: Pick<RailProps, "form" | "providers" | "problem" | "update"> & {
  readonly uses: readonly LlmUse[];
}): ReactElement {
  const labels = [...new Set(uses.map((use) => use.label))];
  const used =
    labels.length <= 1
      ? (labels[0] ?? "")
      : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1) ?? ""}`;
  return (
    <section aria-label="Written by" className="border-b border-line py-4">
      <ServiceGroup
        family="llm"
        meta={used === "" ? undefined : `for ${used}`}
        providers={providers}
        provider={form.llm.provider}
        model={form.llm.model}
        serviceField="llm.provider"
        modelField="llm.model"
        serviceProblem={
          problem("llm.provider") ?? (form.llm.provider === "" ? problem("llm") : undefined)
        }
        modelProblem={
          problem("llm.model") ??
          (form.llm.provider !== "" && problem("llm") ? "Pick a model." : undefined)
        }
        onService={(provider) => update({ llm: { provider, model: "" } })}
        onModel={(model) => update({ llm: { ...form.llm, model } })}
      >
        <ThinkingPicker choice={form.llm} onChange={(llm) => update({ llm })} />
      </ServiceGroup>
    </section>
  );
}

// The picker, in `section` only when that is where the model sits: the section of the first
// thing the run asks an AI to write.
export function TextGenerationIn({
  section,
  entries,
  prompts,
  ...props
}: Pick<RailProps, "form" | "providers" | "problem" | "update"> & {
  readonly section: LlmUse["section"];
  readonly entries: readonly Entry[];
  // The library's prompts, for the keywords Slopify fills that need the text model.
  readonly prompts?: readonly Prompt[];
}): ReactElement | null {
  const uses = llmUsesOf(props.form, entries, prompts);
  return uses[0]?.section === section ? <TextGeneration {...props} uses={uses} /> : null;
}
