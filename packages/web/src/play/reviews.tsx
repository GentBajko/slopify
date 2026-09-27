import type { Prompt } from "@app/slices/library/model.js";
import {
  defaultReviewRetries,
  imageReviewers,
  type ReviewMode,
  type ReviewSettingsForm,
  type ReviewStage,
  reviewModeLabels,
  reviewModes,
  reviewStageLabels,
  reviewStages,
  visionStages,
} from "@app/slices/reviews/model.js";
import { stageMakesItems } from "@app/slices/reviews/rules.js";
import type { ProviderStatus } from "@app/slices/settings/model.js";
import { useQuery } from "@tanstack/react-query";
import { type ReactElement, useId } from "react";
import { useApp } from "@/app-context";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { Input } from "@/components/ui/input";
import { Picker } from "@/components/ui/picker";
import { ModelPicker, ProviderPicker } from "@/play/pickers";
import { promptsQuery, providersQuery } from "@/queries";
import { usePlaySession } from "./draft-context";
import { shortsOn } from "./state";

// Play's Review step: the draft's reviews, saved with the draft like every other choice.
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

// Automatic reviews, on Play's Review step and in Edit project → Reviews. Every control stays
// mounted: a stage that makes nothing has its row disabled, and so is a prompt while its
// review is Off.
export function ReviewSettings({
  value,
  providers,
  prompts,
  makes,
  problem,
  disabled = false,
  onChange,
}: {
  readonly value: ReviewSettingsForm;
  readonly providers: readonly ProviderStatus[];
  readonly prompts: readonly Prompt[];
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
  const blind =
    pictures.length > 0 && value.provider !== "" && !imageReviewers.includes(value.provider);
  return (
    <fieldset
      data-play-field="reviews"
      tabIndex={-1}
      disabled={disabled}
      className="min-w-0 rounded-panel border border-line px-3 pt-1 pb-3"
      {...helpScope}
    >
      <legend className="flex items-center gap-1 px-1 font-semibold">
        Automatic reviews
        <InfoTip id="play.reviews" />
      </legend>
      <div className="grid grid-cols-1 gap-4 min-[700px]:grid-cols-3">
        <ProviderPicker
          field="reviews.provider"
          label="Reviewer"
          tip="play.reviews.provider"
          family="llm"
          providers={providers}
          value={value.provider}
          problem={problem("reviews.provider")}
          onPick={(provider) => onChange({ ...value, provider, model: "" })}
        />
        <ModelPicker
          field="reviews.model"
          label="Reviewer model"
          tip="play.reviews.model"
          provider={value.provider}
          value={value.model}
          problem={problem("reviews.model")}
          onPick={(model) => onChange({ ...value, model })}
        />
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
            <span className="block text-red">{problem("reviews.retries")}</span>
          ) : null}
        </div>
      </div>
      {blind ? (
        <p className="mt-2 text-small text-red">
          Picture reviews need Claude Code or Codex as the reviewer: Slopify can't show pictures to
          this one.
        </p>
      ) : (
        <p className="mt-2 text-label text-ink3">
          Pictures (images, thumbnail, shorts) need Claude Code or Codex as the reviewer.
        </p>
      )}
      <table className="mt-3 w-full text-small">
        <thead className="sr-only">
          <tr>
            <th>Stage</th>
            <th>Review</th>
            <th>Review prompt</th>
          </tr>
        </thead>
        <tbody>
          {reviewStages.map((stage) => {
            const mode = modeOf(stage);
            const prompt = value.stages[stage]?.prompt ?? "";
            const available = makes(stage);
            const saved = prompt !== "" && !choices.some((one) => one.name === prompt);
            return (
              <tr key={stage} className="border-t border-line">
                <th scope="row" className="py-2 pr-3 text-left font-medium">
                  {reviewStageLabels[stage]}
                </th>
                <td className="py-2 pr-3">
                  <Picker
                    aria-label={`${reviewStageLabels[stage]} review`}
                    data-play-field={`reviews.stages.${stage}.mode`}
                    value={mode}
                    disabled={!available && mode === "off"}
                    onChange={(event) => setStage(stage, event.target.value as ReviewMode, prompt)}
                  >
                    {reviewModes.map((one) => (
                      <option key={one} value={one}>
                        {reviewModeLabels[one]}
                      </option>
                    ))}
                  </Picker>
                </td>
                <td className="py-2">
                  <Picker
                    aria-label={`${reviewStageLabels[stage]} review prompt`}
                    data-play-field={`reviews.stages.${stage}.prompt`}
                    value={prompt}
                    disabled={mode === "off"}
                    onChange={(event) => setStage(stage, mode, event.target.value)}
                  >
                    <option value="">Built-in</option>
                    {saved ? <option value={prompt}>{prompt} (saved choice)</option> : null}
                    {choices.map((one) => (
                      <option key={one.id} value={one.name}>
                        {one.name}
                      </option>
                    ))}
                  </Picker>
                  {problem(`reviews.stages.${stage}.prompt`) ? (
                    <p className="text-red">{problem(`reviews.stages.${stage}.prompt`)}</p>
                  ) : !available && mode !== "off" ? (
                    <p className="text-ink3">This stage makes nothing to review in this run.</p>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </fieldset>
  );
}
