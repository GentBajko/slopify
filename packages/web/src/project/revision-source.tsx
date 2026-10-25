import type { StageKind } from "@app/kernel/pipeline.js";
import { type StageSource, type StageSources, sourceOf } from "@app/slices/admission/model.js";
import type { RevisionEdit } from "@app/slices/revisions/model.js";
import type { ReactElement } from "react";
import { HelpLine } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { stageWords } from "@/lib/stage-words";
import { switchWrap } from "@/play/rail-frame";
import { sourceOptions } from "@/play/state";
import { InlineSwitch } from "@/play/switches";
import { changeSource } from "./revision-form-state.js";

// One stage's choice at the top of its settings section, drawn as Create draws it: the stage's
// name, then a strip saying in the stage's own words what each choice makes and what it costs
// ("Narration: AI voice (paid per character) | My own audio file | Off"), then one line where
// the strip needs one. It offers exactly what Create offers for the project's other choices.
export function RevisionSource({
  kind,
  edit,
  articleMarkdown,
  problem,
  onChange,
}: {
  readonly kind: StageKind;
  readonly edit: RevisionEdit;
  // The article the project made, which "Use my text as written" starts from.
  readonly articleMarkdown: string | null | undefined;
  readonly problem: (field: string) => string | undefined;
  readonly onChange: (edit: RevisionEdit) => void;
}): ReactElement | null {
  const { sources } = edit.config;
  // With Article Off, what reads the article is off and not offered.
  if (sources.article === "off" && (kind === "research" || kind === "audio" || kind === "document"))
    return null;
  const options = sourceOptions(kind, sources.audio !== "off")
    // With no article there is nothing for the AI to write a thumbnail prompt from.
    .filter(
      (option) =>
        !(kind === "thumbnail" && option.value === "prompt_by_llm" && sources.article === "off"),
    )
    .map((option) => ({
      ...option,
      disabled: kind === "video" && option.value === "generate" && sources.images === "off",
    }));
  const note = noteOf(kind, sources);
  const error = problem(`sources.${kind}`);
  const pick = (source: StageSource): void => {
    const next = changeSource(edit, kind, source);
    onChange(
      kind === "article" && source === "provide" && !edit.content.articleEdited
        ? {
            ...next,
            content: {
              ...next.content,
              articleMarkdown: articleMarkdown ?? edit.content.articleMarkdown,
            },
          }
        : next,
    );
  };
  return (
    <div className="flex min-w-0 flex-col gap-1" {...(note === undefined ? {} : helpScope)}>
      <InlineSwitch<StageSource>
        field={`sources.${kind}`}
        label={stageWords[kind]}
        className={switchWrap}
        value={sourceOf(sources, kind)}
        options={options}
        onPick={pick}
      />
      {note === undefined ? null : <HelpLine>{note}</HelpLine>}
      {error === undefined ? null : <p className="sl-field__error m-0">{error}</p>}
    </div>
  );
}

// The one line under a strip, in Create's words, where the choices need it: what researching
// adds, what the video is made from, what the thumbnail and the PDF are and cost.
function noteOf(kind: StageKind, sources: StageSources): string | undefined {
  switch (kind) {
    case "research":
      return sources.research === "generate"
        ? "The AI plans chapters and looks each one up on the web before it writes: a few more AI calls."
        : undefined;
    case "video": {
      const narrated = sources.audio !== "off";
      const made =
        sources.video === "generate" && sources.images !== "off"
          ? narrated
            ? "The narration over the images, put together on this computer · free."
            : "A silent video, each image shown once, put together on this computer · free."
          : narrated
            ? "Sound only: the narration as one audio file."
            : "Each finished stage downloads on its own.";
      // Make the video cannot be picked while there are no images; the line says why.
      return sources.images === "off" ? `${made} A video needs images first.` : made;
    }
    case "thumbnail":
      return "The picture people see before they press play. A drawn one is one image call each.";
    case "document":
      return "Laid out on this computer from the article and title · free.";
    default:
      return undefined;
  }
}
