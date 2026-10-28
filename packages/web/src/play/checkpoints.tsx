import { type ReactElement, useId } from "react";
import { Checkbox, HelpLine } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { stageWords } from "@/lib/stage-words";
import { usePlaySession } from "./draft-context";
import type { PlayFormState } from "./state";

export const checkpointOptions = [
  { stage: "audio", label: stageWords.audio },
  { stage: "images", label: stageWords.images },
  { stage: "video", label: stageWords.video },
] as const;

type CheckpointStage = (typeof checkpointOptions)[number]["stage"];

// A checkpoint holds the run before its stage. It is named for what there is to look at when
// it stops, and for what waits: "Pause after the article (before the narration)".
export function pauseLabel(
  stage: CheckpointStage,
  form: {
    readonly sources: { readonly audio: string; readonly images: string; readonly video: string };
  },
): string {
  const { sources } = form;
  const narrated = sources.audio !== "off";
  switch (stage) {
    case "audio":
      return "Pause after the article (before the narration)";
    case "images":
      return `Pause after ${narrated ? "the narration" : "the article"} (before the images)`;
    case "video":
      return sources.images !== "off"
        ? `Pause after the images (before ${sources.video === "generate" ? "the video" : "the sound file"})`
        : "Pause after the narration (before the sound file)";
  }
}

export function checkpointTarget(
  field: string,
  form: PlayFormState,
): { readonly section: "review"; readonly field: string } | undefined {
  // The automatic reviews sit on the same step as the checkpoints.
  if (field === "reviews" || field.startsWith("reviews.")) return { section: "review", field };
  if (field !== "checkpoints" && !field.startsWith("checkpoints.")) return undefined;
  const suffix = field.slice("checkpoints.".length);
  const stage = /^\d+$/.test(suffix) ? form.checkpoints?.[Number(suffix)] : suffix;
  return {
    section: "review",
    field: checkpointOptions.some((option) => option.stage === stage)
      ? `checkpoints.${stage}`
      : "checkpoints",
  };
}

// Pause for my approval: one tick per stage the run can stop before, each named for what it
// stops after. A stage this run does not make has no tick, unless one was ticked before, which
// stays with the reason it cannot apply.
export function CheckpointControls({
  problem,
}: {
  readonly problem: (field: string) => string | undefined;
}): ReactElement {
  const session = usePlaySession();
  const { document, review } = session;
  const { form } = document;
  const prefix = useId();
  const selected = form.checkpoints ?? [];
  // A pause needs something made before it to look at: the images of a run with no article and
  // no narration (the Images kind) are the first thing it makes, so there is no pause before them.
  const madeBefore = (stage: CheckpointStage): boolean =>
    stage !== "images" || form.sources.article !== "off" || form.sources.audio !== "off";
  const enabledOf = (stage: CheckpointStage): boolean =>
    madeBefore(stage) &&
    (stage === "video"
      ? (form.sources.video !== "off" && form.sources.images !== "off") ||
        form.sources.audio !== "off"
      : form.sources[stage] === "generate");
  const shown = checkpointOptions.filter(
    ({ stage }) => enabledOf(stage) || selected.includes(stage),
  );
  if (shown.length === 0 && form.sources.article === "off" && form.sources.audio === "off")
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <p className="m-0 text-body font-semibold">Pause for my approval</p>
        <p className="m-0 text-small text-ink-2">
          Nothing to pause for: the images are the first thing this run makes.
        </p>
      </div>
    );
  return (
    <fieldset
      data-play-field="checkpoints"
      tabIndex={-1}
      aria-invalid={problem("checkpoints") !== undefined}
      disabled={review.starting || review.uncertain}
      className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0"
      {...helpScope}
    >
      <legend className="mb-1 p-0 text-body font-semibold">Pause for my approval</legend>
      {shown.map(({ stage, label }) => {
        const checked = selected.includes(stage);
        const enabled = enabledOf(stage);
        const error =
          problem(`checkpoints.${stage}`) ??
          (enabled
            ? undefined
            : `This run makes no ${label.toLowerCase()} to pause before: untick it.`);
        const id = `${prefix}-${stage}`;
        return (
          <div key={stage}>
            <label htmlFor={id} className="flex min-h-9 items-center gap-3 max-[1099px]:min-h-11">
              <Checkbox
                id={id}
                data-play-field={`checkpoints.${stage}`}
                aria-invalid={error !== undefined}
                aria-describedby={error === undefined ? undefined : `${id}-detail`}
                checked={checked}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...selected, stage]
                    : selected.filter((value) => value !== stage);
                  session.edit({ ...document, form: { ...form, checkpoints: next } });
                  session.invalidateReview(true);
                }}
              />
              {pauseLabel(stage, form)}
            </label>
            {error === undefined ? null : (
              <p id={`${id}-detail`} className="m-0 pl-7 text-small text-danger">
                {error}
              </p>
            )}
          </div>
        );
      })}
      <HelpLine>The run waits under Home → Needs you until you approve.</HelpLine>
      {problem("checkpoints") ? (
        <p className="m-0 text-small text-danger">{problem("checkpoints")}</p>
      ) : null}
    </fieldset>
  );
}
