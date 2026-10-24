import type { ProviderChoice } from "@app/slices/admission/model.js";
import type { Prompt } from "@app/slices/library/model.js";
import {
  defaultReviewRetries,
  imageReviewers,
  type Reviewer,
  type ReviewMode,
  type ReviewSettingsForm,
  type ReviewStage,
  reviewerLabels,
  reviewers,
  reviewModes,
  reviewStageLabels,
  reviewStagesInRunOrder,
  visionStages,
} from "@app/slices/reviews/model.js";
import { stageMakesItems } from "@app/slices/reviews/rules.js";
import type { ProviderStatus } from "@app/slices/settings/model.js";
import { useQuery } from "@tanstack/react-query";
import { type ReactElement, useId } from "react";
import { useApp } from "@/app-context";
import { HelpLine, Input } from "@/components/kit/field";
import { Fold } from "@/components/kit/fold";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { Segmented } from "@/components/kit/switch";
import { Picker } from "@/components/ui/picker";
import { promptsQuery, providersQuery } from "@/queries";
import { usePlaySession } from "./draft-context";
import { ServiceGroup } from "./service-group";
import { shortsOn } from "./state";

// What each choice does, said as what the person gets.
const modeWords: Readonly<Record<ReviewMode, string>> = {
  off: "Off",
  flag: "Flag problems",
  redo: "Flag and redo",
};

// Play's Pauses and checks row: the draft's AI checks, saved with the draft like every other
// choice.
export function PlayReviews({
  problem,
}: {
  readonly problem: (field: string) => string | undefined;
}): ReactElement {
  const { api } = useApp();
  const session = usePlaySession();
  const { document, review } = session;
  const { form } = document;
  const providers = useQuery(providersQuery(api));
  const prompts = useQuery(promptsQuery(api));
  return (
    <ReviewSettings
      value={form.reviews ?? emptyReviews}
      providers={providers.data?.providers ?? []}
      prompts={prompts.data?.prompts ?? []}
      writer={form.llm}
      makes={(stage) =>
        stageMakesItems(
          { sources: form.sources, shorts: shortsOn(form) ? { enabled: true } : undefined },
          stage,
        )
      }
      problem={problem}
      disabled={review.starting || review.uncertain}
      onChange={(reviews) => {
        session.edit({ ...document, form: { ...form, reviews } });
        session.invalidateReview(true);
      }}
    />
  );
}

export const emptyReviews: ReviewSettingsForm = {
  provider: "",
  model: "",
  retries: "",
  stages: {},
};

// The one choice most people make, over every stage this run makes something for: the mode
// they all share, or undefined while the stages differ.
export function overallMode(
  value: ReviewSettingsForm,
  makes: (stage: ReviewStage) => boolean,
): ReviewMode | undefined {
  const modes = new Set(
    reviewStagesInRunOrder
      .filter((stage) => makes(stage) && stage !== "promise")
      .map((stage) => value.stages[stage]?.mode ?? "off"),
  );
  if (modes.size === 0) return "off";
  return modes.size === 1 ? [...modes][0] : undefined;
}

// AI checks, on Play's Pauses and checks row and in Edit project → Reviews: one choice for the
// whole run, and under Advanced who checks, how many redos, and each stage's own mode and
// prompt. A stage this run makes nothing for has its row greyed with the reason.
export function ReviewSettings({
  value,
  providers,
  prompts,
  writer,
  makes,
  problem,
  disabled = false,
  onChange,
}: {
  readonly value: ReviewSettingsForm;
  readonly providers: readonly ProviderStatus[];
  readonly prompts: readonly Prompt[];
  // The run's own writer, which checks too until another is picked.
  readonly writer?: ProviderChoice | undefined;
  // Whether the run makes items for this stage to review.
  readonly makes: (stage: ReviewStage) => boolean;
  readonly problem: (field: string) => string | undefined;
  readonly disabled?: boolean | undefined;
  readonly onChange: (next: ReviewSettingsForm) => void;
}): ReactElement {
  const id = useId();
  const choices = prompts.filter((one) => one.kind === "review");
  const modeOf = (stage: ReviewStage): ReviewMode => value.stages[stage]?.mode ?? "off";
  const setStage = (stage: ReviewStage, mode: ReviewMode, prompt: string) =>
    onChange({ ...value, stages: { ...value.stages, [stage]: { mode, prompt } } });
  const pictures = visionStages.filter((stage) => modeOf(stage) !== "off" && makes(stage));
  const byAgent = value.reviewer === "agent";
  const blind =
    !byAgent &&
    pictures.length > 0 &&
    value.provider !== "" &&
    !imageReviewers.includes(value.provider);
  const overall = overallMode(value, makes);
  // One choice for every stage this run makes something for; the promise check stays as it is
  // set under Advanced. Turning checks on with no checker picked uses the run's writer.
  const setAll = (mode: ReviewMode): void => {
    const stages = { ...value.stages };
    for (const stage of reviewStagesInRunOrder) {
      if (stage === "promise" || (mode !== "off" && !makes(stage))) continue;
      stages[stage] = { mode, prompt: value.stages[stage]?.prompt ?? "" };
    }
    const checker =
      mode !== "off" && value.provider === "" && writer !== undefined && writer.provider !== ""
        ? { provider: writer.provider, model: writer.model }
        : {};
    onChange({ ...value, ...checker, stages });
  };
  const on = reviewStagesInRunOrder.filter((stage) => modeOf(stage) !== "off");
  const advancedState = [
    byAgent ? reviewerLabels.agent : value.provider === "" ? undefined : value.provider,
    on.length === 0
      ? undefined
      : `${String(on.length)} ${on.length === 1 ? "stage" : "stages"} checked`,
  ]
    .filter((part) => part !== undefined)
    .join(", ");
  return (
    <fieldset
      data-play-field="reviews"
      tabIndex={-1}
      disabled={disabled}
      className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0"
    >
      <p className="m-0 mb-1 text-body font-semibold" aria-hidden="true">
        Have an AI check the results
      </p>
      <Segmented<ReviewMode | "mixed">
        label="Have an AI check the results"
        value={overall ?? "mixed"}
        options={reviewModes.map((mode) => ({ value: mode, label: modeWords[mode] }))}
        help={
          overall === undefined
            ? "Each stage is set on its own under Advanced."
            : "Each check is one more AI call per item; a redo makes the item again, at its price."
        }
        onChange={(mode) => {
          if (mode !== "mixed") setAll(mode);
        }}
      />
      <Fold summary="Advanced" state={advancedState === "" ? undefined : advancedState}>
        <div className="flex min-w-0 flex-col gap-4 pt-2 pb-3" {...helpScope}>
          <HelpLine>
            Who checks, how often a failed item is made again, and each stage's own check and Review
            prompt.
          </HelpLine>
          <div className="sl-fields">
            <div className="block text-small">
              <Segmented<Reviewer>
                label="Who checks"
                tip="play.reviews.reviewer"
                value={value.reviewer ?? "model"}
                options={reviewers.map((one) => ({ value: one, label: reviewerLabels[one] }))}
                onChange={(reviewer) => onChange({ ...value, reviewer })}
              />
            </div>
            <div className="block space-y-1 text-small" {...helpScope}>
              <span className="flex items-center gap-1">
                <label htmlFor={`${id}-retries`}>Redos per item</label>
                <InfoTip id="play.reviews.retries" className="-my-1" />
              </span>
              <Input
                id={`${id}-retries`}
                data-play-field="reviews.retries"
                inputMode="numeric"
                placeholder={String(defaultReviewRetries)}
                value={value.retries}
                aria-invalid={problem("reviews.retries") !== undefined}
                onChange={(event) => onChange({ ...value, retries: event.target.value })}
              />
              {problem("reviews.retries") ? (
                <span className="block text-danger">{problem("reviews.retries")}</span>
              ) : null}
            </div>
          </div>
          {byAgent ? (
            <p className="m-0 text-small text-ink-2">
              The external agent answers through MCP and is shown the pictures; no API fee.
            </p>
          ) : (
            <ServiceGroup
              family="llm"
              label="Checked by"
              providers={providers}
              provider={value.provider}
              model={value.model}
              serviceField="reviews.provider"
              modelField="reviews.model"
              serviceProblem={problem("reviews.provider")}
              modelProblem={problem("reviews.model")}
              onService={(provider) => onChange({ ...value, provider, model: "" })}
              onModel={(model) => onChange({ ...value, model })}
            />
          )}
          {blind ? (
            <p className="m-0 text-small text-danger">
              Picture checks need Claude Code or Codex as the checker: Slopify can't show pictures
              to this one.
            </p>
          ) : byAgent ? null : (
            <p className="m-0 text-label text-ink-3">
              Pictures (images, thumbnail, shorts) need Claude Code or Codex as the checker.
            </p>
          )}
          {/* The two pickers share a cell and wrap under each other in a narrow drawer, so
              neither ever cuts its words short. */}
          <table className="w-full text-small">
            <thead>
              <tr className="text-left text-label text-ink-2">
                <th className="w-[28%] pb-1 pr-3 font-semibold">Stage</th>
                <th className="pb-1 font-semibold">Check, and the prompt it uses</th>
              </tr>
            </thead>
            <tbody>
              {reviewStagesInRunOrder.map((stage) => {
                const mode = modeOf(stage);
                const prompt = value.stages[stage]?.prompt ?? "";
                const available = makes(stage);
                const saved = prompt !== "" && !choices.some((one) => one.name === prompt);
                return (
                  <tr key={stage} className="border-t border-line">
                    <th scope="row" className="py-2 pr-3 text-left align-top font-medium">
                      <span className="inline-flex items-center gap-1">
                        {reviewStageLabels[stage]}
                        {stage === "promise" ? (
                          <InfoTip id="play.reviews.promise" className="-my-1" />
                        ) : null}
                      </span>
                    </th>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        <Picker
                          className="w-[10.5rem] shrink-0"
                          aria-label={`${reviewStageLabels[stage]}: check`}
                          data-play-field={`reviews.stages.${stage}.mode`}
                          value={mode}
                          disabled={!available && mode === "off"}
                          onChange={(event) =>
                            setStage(stage, event.target.value as ReviewMode, prompt)
                          }
                        >
                          {reviewModes.map((one) => (
                            <option key={one} value={one}>
                              {modeWords[one]}
                            </option>
                          ))}
                        </Picker>
                        {mode === "off" ? null : (
                          <Picker
                            className="w-auto min-w-[12rem] flex-1"
                            aria-label={`${reviewStageLabels[stage]}: prompt`}
                            data-play-field={`reviews.stages.${stage}.prompt`}
                            value={prompt}
                            onChange={(event) => setStage(stage, mode, event.target.value)}
                          >
                            <option value="">Built-in prompt</option>
                            {saved ? <option value={prompt}>{prompt} (saved choice)</option> : null}
                            {choices.map((one) => (
                              <option key={one.id} value={one.name}>
                                {one.name}
                              </option>
                            ))}
                          </Picker>
                        )}
                      </div>
                      {problem(`reviews.stages.${stage}.prompt`) ? (
                        <p className="m-0 text-danger">
                          {problem(`reviews.stages.${stage}.prompt`)}
                        </p>
                      ) : !available && stage === "promise" ? (
                        <p className="m-0 text-ink-3">Needs an article the AI writes.</p>
                      ) : !available ? (
                        <p className="m-0 text-ink-3">This run makes nothing here to check.</p>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Fold>
    </fieldset>
  );
}
