import type { Prompt } from "@app/slices/library/model.js";
import {
  type ReviewSettingsForm,
  reviewPromptKey,
  reviewSettingsForm,
  reviewSettingsFromForm,
  reviewStages,
} from "@app/slices/reviews/model.js";
import { stageMakesItems } from "@app/slices/reviews/rules.js";
import type { RevisionEdit } from "@app/slices/revisions/model.js";
import type { ProviderStatus } from "@app/slices/settings/model.js";
import { type ReactElement, useState } from "react";
import { emptyReviews, ReviewSettings } from "@/play/reviews";
import { editOfForm } from "./revision-form-state";

// Edit project → Reviews. A picked library prompt is frozen into the project like the others;
// Built-in drops the frozen copy. Turning every review Off removes the settings, so the
// project plans exactly as one that never had reviews.
export function RevisionReviews({
  edit,
  providers,
  prompts,
  problem,
  onChange,
}: {
  readonly edit: RevisionEdit;
  readonly providers: readonly ProviderStatus[];
  readonly prompts: readonly Prompt[];
  readonly problem: (field: string) => string | undefined;
  readonly onChange: (edit: RevisionEdit) => void;
}): ReactElement {
  const { config } = edit;
  const saved = config.reviews === undefined ? emptyReviews : reviewSettingsForm(config.reviews);
  // What was typed but is not a setting yet (a reviewer before any review is on, redos that
  // are not a number), kept while the editor is open.
  const [draft, setDraft] = useState<ReviewSettingsForm>(saved);
  const shorts = config.shorts?.enabled === true && config.sources.audio !== "off";
  const makes = (stage: (typeof reviewStages)[number]) =>
    stageMakesItems(
      { sources: config.sources, shorts: shorts ? { enabled: true } : undefined },
      stage,
    );
  const typedRetries = reviewSettingsFromForm(draft, makes).retriesProblem;
  return (
    <ReviewSettings
      value={draft}
      providers={providers}
      prompts={prompts}
      makes={makes}
      problem={(field) =>
        field === "reviews.retries" && typedRetries !== undefined ? typedRetries : problem(field)
      }
      onChange={(next) => {
        setDraft(next);
        const { settings } = reviewSettingsFromForm(next, makes);
        let promptTemplates = { ...edit.content.promptTemplates };
        let rendered = { ...config.rendered };
        for (const stage of reviewStages) {
          const key = reviewPromptKey(stage);
          const name = settings?.stages[stage]?.prompt ?? "";
          const picked = prompts.find((one) => one.kind === "review" && one.name === name);
          if (name === "") {
            const { [key]: _template, ...templates } = promptTemplates;
            const { [key]: _text, ...texts } = rendered;
            promptTemplates = templates;
            rendered = texts;
          } else if (picked !== undefined && name !== (config.reviews?.stages[stage]?.prompt ?? ""))
            promptTemplates = { ...promptTemplates, [key]: picked.body };
        }
        const { reviews: _previous, ...rest } = config;
        onChange(
          editOfForm({
            ...edit,
            config: { ...rest, rendered, ...(settings === undefined ? {} : { reviews: settings }) },
            content: { ...edit.content, promptTemplates },
          }),
        );
      }}
    />
  );
}
