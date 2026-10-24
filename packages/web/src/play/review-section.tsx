import type { Field } from "@app/slices/admission/substitute.js";
import { ArrowRightIcon } from "lucide-react";
import { type ReactElement, useEffect } from "react";
import { Button } from "@/components/kit/button";
import { Fold } from "@/components/kit/fold";
import { usePlaySession } from "./draft-context";
import { outputKindOf } from "./output-kind";
import type { SetupProblem } from "./problems";
import { ReviewSummary } from "./review-summary";
import { rowLabel } from "./setup-rows";

// The summary drawer behind "See everything this run will do": what still stops the Make
// button, as links to the row that fixes each, then every setting of the run in words, grouped
// like the form, and the prompts as they will be sent. The button and the estimate stay in its
// foot.
export function ReviewSection({
  fields,
  topicField,
  problems,
  onFix,
  onReveal,
}: {
  readonly fields: readonly Field[];
  readonly topicField: string;
  readonly problems: readonly SetupProblem[];
  readonly onFix: (problem: SetupProblem) => void;
  readonly onReveal: (field: string) => void;
}): ReactElement {
  const session = usePlaySession();
  const { document, review } = session;
  const form = document.form;
  const kind = outputKindOf(form);
  // Opening the summary asks the server too: it knows rules the browser's copy can't see.
  useEffect(() => {
    void session.reviewDraft();
  }, [session.reviewDraft]);
  const runs = review.valid ? (review.receipt?.runs ?? []) : [];
  const checkAgain = (
    <Button
      variant="quiet"
      size="small"
      disabled={review.pending || review.starting || review.uncertain}
      onClick={() => {
        void session.reviewDraft();
      }}
    >
      {review.pending ? "Checking…" : "Check again"}
    </Button>
  );
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section aria-label="Before you can start" className="min-w-0">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="m-0 font-semibold">
            {problems.length === 0 ? "Nothing is missing" : "Before you can start"}
          </h3>
          {checkAgain}
        </div>
        {problems.length === 0 ? null : (
          <ul aria-label="What is missing" className="m-0 flex list-none flex-col gap-2 p-0">
            {problems.map((problem) => (
              <li key={`${problem.field}-${problem.text}`}>
                <Button
                  variant="secondary"
                  size="small"
                  className="h-auto min-h-8 max-w-full justify-start whitespace-normal py-1 text-left"
                  onClick={() => onFix(problem)}
                >
                  <span className="font-semibold">
                    {problem.row === undefined
                      ? "Setup"
                      : problem.row === "topic"
                        ? "Topic"
                        : rowLabel(problem.row, kind)}
                    :
                  </span>
                  <span>{problem.text}</span>
                  <ArrowRightIcon aria-hidden="true" strokeWidth={1.75} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <ReviewSummary fields={fields} topicField={topicField} onReveal={onReveal}>
        <Fold
          summary={
            form.sources.article === "provide"
              ? "Your article and the prompts as they will be sent"
              : "The prompts as they will be sent"
          }
          className="mt-2"
        >
          {runs.length ? (
            runs.map((run, index) => (
              <div key={document.variants[index - 1]?.id ?? session.activeId} className="mt-3">
                <h4 className="m-0 font-medium">{run.draft.title}</h4>
                {run.draft.sources.article === "provide" ? (
                  <p className="mt-2 whitespace-pre-wrap break-words text-body">
                    {run.draft.provided.article}
                  </p>
                ) : null}
                {Object.entries(run.rendered).map(([name, text]) => (
                  <div key={name} className="mt-2">
                    <h5 className="m-0 text-small text-ink-2">{name}</h5>
                    <p className="m-0 whitespace-pre-wrap break-words text-body">{text}</p>
                  </div>
                ))}
              </div>
            ))
          ) : (
            <p className="m-0 mt-2 text-small text-ink-2">
              They show here once nothing is missing.
            </p>
          )}
        </Fold>
      </ReviewSummary>
    </div>
  );
}
