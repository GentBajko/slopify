import type { FieldError } from "@app/slices/admission/rules.js";
import { PlayIcon } from "lucide-react";
import { type ReactElement, type ReactNode, useEffect } from "react";
import { Button, ButtonRow, PlayKey } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { ariaKeyShortcuts } from "@/components/kit/command-palette";
import { Field, Input } from "@/components/kit/field";
import { InfoTip } from "@/components/kit/info-tip";
import { SectionHead } from "@/components/kit/section-head";
import { Switch } from "@/components/kit/switch";
import { shortcuts } from "@/lib/shortcuts";
import type { Blocker } from "./admission";
import { usePlaySession } from "./draft-context";
import { outputCount, outputKindOf, outputNoun } from "./output-kind";
import { PlanAllowance } from "./plan-allowance";
import { pageVideos, pendingReviewUpload, queued, startLabel } from "./review-state";
import { RunReview } from "./run-review";

// Why the Play key can't start right now, in the order it would be fixed, with the field to
// jump to when there is one. Undefined while it can start.
export function startReason({
  review,
  blocker,
  errors,
  pendingUpload,
}: {
  readonly review: ReturnType<typeof usePlaySession>["review"];
  readonly blocker: Blocker | undefined;
  readonly errors: readonly FieldError[];
  readonly pendingUpload: string | undefined;
}): { readonly text: string; readonly field?: string } | undefined {
  if (review.starting) return undefined;
  if (review.uncertain)
    return {
      text: "Slopify didn't confirm the last start. Press Check whether it started to find out before starting again.",
    };
  if (blocker) return { text: blocker.hint, field: blocker.field };
  const refused = errors[0];
  if (refused) return { text: refused.message, field: refused.field };
  if (pendingUpload)
    return { text: "Wait for uploads to finish before Start", field: pendingUpload };
  if (review.error) return { text: review.error };
  if (review.pending) return { text: "Checking your setup and the estimate…" };
  if (!review.valid) return { text: "Checking your setup and the estimate…" };
  return undefined;
}

// The right rail of Play: the review of what Start will do (videos, cost, limits), always
// current, and the Play key with the reason it can't start right under it.
export function StartRail({
  errors,
  blocker,
  saveProblem,
  onReveal,
  onWholeSetup,
  onSaveTemplate,
  preview,
}: {
  readonly errors: readonly FieldError[];
  readonly blocker: Blocker | undefined;
  readonly saveProblem: string | undefined;
  readonly onReveal: (field: string) => void;
  readonly onWholeSetup: () => void;
  readonly onSaveTemplate: () => void;
  readonly preview?: ReactNode;
}): ReactElement {
  const session = usePlaySession();
  const { document, review } = session;
  const pendingUpload = pendingReviewUpload(document, session.view);
  const locked = review.starting || review.uncertain;
  useEffect(() => {
    void session.reviewDraft();
  }, [session.reviewDraft]);
  // Every edit leaves the review stale; it is checked again once typing pauses, so the
  // estimate and the key are always about what is on screen.
  const stale =
    !review.valid &&
    !review.pending &&
    !review.starting &&
    !review.uncertain &&
    review.error === null &&
    errors.length === 0 &&
    blocker === undefined &&
    !pendingUpload &&
    session.activeId !== null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: each edit restarts the pause.
  useEffect(() => {
    if (!stale) return;
    const timer = setTimeout(() => void session.reviewDraft(), 800);
    return () => clearTimeout(timer);
  }, [stale, document, session.reviewDraft]);
  const count = review.valid && review.receipt ? review.receipt.runs.length : pageVideos(document);
  const reason = startReason({ review, blocker, errors, pendingUpload });
  const disabled =
    review.starting ||
    (!review.uncertain &&
      (!review.valid || review.pending || errors.length > 0 || Boolean(pendingUpload)));
  return (
    <>
      {preview}
      <section aria-label="Start" className="flex min-w-0 flex-col gap-4 border-t border-line pt-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-ink-2">{outputCount(outputKindOf(document.form), count)}</span>
          {count > 1 ? (
            <Switch
              label="Queue"
              tip="play.batch-queue"
              checked={queued(document)}
              disabled={locked}
              onChange={(next) => session.edit({ ...document, queue: next })}
            />
          ) : (
            <span className="text-small text-ink-3">One run</span>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <SectionHead title="Estimated cost" info="play.estimate" size="small" className="pb-0" />
          {review.valid && review.receipt ? (
            <RunReview estimates={review.receipt.estimates} />
          ) : (
            <p role="status" className="m-0 text-small text-ink-2">
              {review.pending
                ? "Calculating the estimate…"
                : "The estimate appears once the setup is complete."}
            </p>
          )}
          <PlanAllowance form={document.form} />
          <Field
            label={`Expected article words per ${outputNoun(outputKindOf(document.form))}`}
            tip="play.expected-words"
            className="mt-2"
          >
            <Input
              data-play-field="expectedWords"
              type="number"
              min={1}
              max={100000}
              value={document.expectedWords}
              disabled={locked}
              onChange={(event) => session.edit({ ...document, expectedWords: event.target.value })}
            />
          </Field>
        </div>
        {saveProblem ? <Callout tone="danger" title={saveProblem} /> : null}
        <PlayKey
          data-tour="play-start"
          disabled={disabled}
          aria-describedby={reason ? "play-start-reason" : undefined}
          onClick={() => {
            void session.startRun();
          }}
        >
          <PlayIcon aria-hidden="true" strokeWidth={1.75} />
          {startLabel(review, document)}
        </PlayKey>
        <div id="play-start-reason" className="min-h-5 text-center text-small">
          {reason === undefined ? (
            <span className="text-ink-3">
              {count === 1
                ? "Nothing starts until you press it."
                : queued(document)
                  ? "They run one after another. Nothing starts until you press it."
                  : "They all run at once. Nothing starts until you press it."}
            </span>
          ) : reason.field === undefined ? (
            <span
              role={review.error ? "alert" : "status"}
              className={review.error ? "text-danger" : "text-ink-2"}
            >
              {reason.text}
            </span>
          ) : (
            <span className="inline-flex flex-wrap items-center justify-center gap-x-1">
              <span id="play-start-field" className="text-waiting">
                {reason.text}
              </span>
              <Button
                variant="quiet"
                size="small"
                aria-describedby="play-start-field"
                onClick={() => onReveal(reason.field ?? "")}
              >
                Go to the field
              </Button>
            </span>
          )}
        </div>
        <ButtonRow className="justify-center">
          <span className="inline-flex items-center">
            <Button
              variant="quiet"
              size="small"
              disabled={review.pending || locked || Boolean(pendingUpload)}
              onClick={() => {
                void session.reviewDraft();
              }}
            >
              Refresh review
            </Button>
            <InfoTip id="play.refresh-review" />
          </span>
          <Button
            variant="quiet"
            size="small"
            aria-keyshortcuts={ariaKeyShortcuts(shortcuts.reviewSetup)}
            onClick={onWholeSetup}
          >
            Review the whole setup
          </Button>
          <Button variant="quiet" size="small" onClick={onSaveTemplate}>
            Save as template
          </Button>
        </ButtonRow>
      </section>
    </>
  );
}
