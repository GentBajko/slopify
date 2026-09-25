import { type ReactElement, useId } from "react";
import { InfoTip } from "@/components/kit/info-tip";
import { usePlaySession } from "./draft-context";
import type { PlayFormState } from "./state";

export const checkpointOptions = [
  { stage: "audio", label: "Audio" },
  { stage: "images", label: "Images" },
  { stage: "video", label: "Video / export" },
] as const;

export function checkpointTarget(
  field: string,
  form: PlayFormState,
): { readonly section: "review"; readonly field: string } | undefined {
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
  return (
    <fieldset
      data-play-field="checkpoints"
      tabIndex={-1}
      aria-invalid={problem("checkpoints") !== undefined}
      disabled={review.starting || review.uncertain}
      className="min-w-0 rounded-panel border border-line px-3 pt-1 pb-2"
    >
      <legend className="flex items-center gap-1 px-1 font-semibold">
        Review checkpoints
        <InfoTip label="review checkpoints">
          <p>
            Hold a step so you can review and edit before it runs. Independent steps continue.
            Approve each checkpoint on the project page when you are ready.
          </p>
        </InfoTip>
      </legend>
      <div className="flex flex-wrap gap-x-6">
        {checkpointOptions.map(({ stage, label }) => {
          const checked = selected.includes(stage);
          const enabled =
            stage === "video"
              ? (form.sources.video !== "off" && form.sources.images !== "off") ||
                form.sources.audio !== "off"
              : form.sources[stage] === "generate";
          const error = problem(`checkpoints.${stage}`);
          const id = `${prefix}-${stage}`;
          return (
            <div key={stage}>
              <label
                htmlFor={id}
                className="flex min-h-10 items-center gap-3 max-[1099px]:min-h-11"
              >
                <input
                  id={id}
                  type="checkbox"
                  data-play-field={`checkpoints.${stage}`}
                  aria-invalid={error !== undefined}
                  aria-describedby={`${id}-detail`}
                  checked={checked}
                  disabled={!enabled && !checked}
                  className="size-4 accent-accent"
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...selected, stage]
                      : selected.filter((value) => value !== stage);
                    session.edit({ ...document, form: { ...form, checkpoints: next } });
                    session.invalidateReview(true);
                  }}
                />
                Before {label}
              </label>
              <p
                id={`${id}-detail`}
                className={error || (checked && !enabled) ? "pl-7 text-small text-red" : "sr-only"}
              >
                {error ??
                  (enabled
                    ? "Approval required before this step and its dependents run."
                    : checked
                      ? "This step is unavailable. Remove its checkpoint or enable the step."
                      : stage === "video"
                        ? "Enable Video or Audio to review before export."
                        : `Choose Generate for ${label} to add this checkpoint.`)}
              </p>
            </div>
          );
        })}
      </div>
      {problem("checkpoints") ? (
        <p className="text-small text-red">{problem("checkpoints")}</p>
      ) : null}
    </fieldset>
  );
}
