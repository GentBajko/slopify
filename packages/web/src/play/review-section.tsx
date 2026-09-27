import type { FieldError } from "@app/slices/admission/rules.js";
import type { Field } from "@app/slices/admission/substitute.js";
import { type ReactElement, useEffect } from "react";
import { Button } from "@/components/kit/button";
import { CheckpointControls } from "./checkpoints";
import { usePlaySession } from "./draft-context";
import { ReviewSummary } from "./review-summary";
import { PlayReviews } from "./reviews";

// The side panel behind Reviews and "Review the whole setup": every setting of the run in
// words, the checkpoints and automatic reviews, and the prompts as they will be sent.
export function ReviewSection({
  fields,
  errors,
  onReveal,
  problem,
}: {
  readonly fields: readonly Field[];
  readonly errors: readonly FieldError[];
  readonly onReveal: (field: string) => void;
  readonly problem: (field: string) => string | undefined;
}): ReactElement {
  const session = usePlaySession();
  const { document, review } = session;
  const form = document.form;
  // Opening the whole setup asks the server too: it knows rules the browser's copy can't see.
  useEffect(() => {
    void session.reviewDraft();
  }, [session.reviewDraft]);
  const runs = review.valid ? (review.receipt?.runs ?? []) : [];
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <p className="m-0 text-body text-ink-2">
        Everything this run will do, the checkpoints it stops at and the reviews it runs. The
        estimate and the Play key stay in the right rail.
      </p>
      {errors.length ? (
        <ul aria-label="Setup errors" className="text-small text-danger">
          {errors.map((error) => (
            <li key={`${error.field}-${error.message}`}>
              <Button variant="quiet" onClick={() => onReveal(error.field)}>
                {error.message}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <CheckpointControls problem={problem} />
      <PlayReviews problem={problem} />
      <ReviewSummary fields={fields} onReveal={onReveal}>
        <details className="mt-5 border-t border-line py-3">
          <summary className="cursor-pointer text-small">
            {form.sources.article === "provide"
              ? "Read the supplied article and resolved prompts"
              : "Read the resolved prompt"}
          </summary>
          {runs.length ? (
            runs.map((run, index) => (
              <div key={document.variants[index - 1]?.id ?? session.activeId} className="mt-4">
                <h4 className="font-medium">{run.draft.title}</h4>
                {run.draft.sources.article === "provide" ? (
                  <p className="mt-3 whitespace-pre-wrap break-words text-body">
                    {run.draft.provided.article}
                  </p>
                ) : null}
                {Object.entries(run.rendered).map(([name, text]) => (
                  <div key={name} className="mt-3">
                    <h5 className="text-small text-ink-2">{name}</h5>
                    <p className="whitespace-pre-wrap break-words text-body">{text}</p>
                  </div>
                ))}
              </div>
            ))
          ) : (
            <p className="mt-3 text-small text-ink-2">
              Refresh review to read the exact resolved inputs.
            </p>
          )}
        </details>
      </ReviewSummary>
    </div>
  );
}
