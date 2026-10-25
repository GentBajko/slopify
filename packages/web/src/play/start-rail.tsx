import { ArrowRightIcon, PencilIcon, PlayIcon } from "lucide-react";
import {
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
} from "react";
import { Button, PlayKey } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { ariaKeyShortcuts } from "@/components/kit/command-palette";
import { Dialog } from "@/components/kit/dialog";
import { Field, Input } from "@/components/kit/field";
import { Segmented } from "@/components/kit/switch";
import { shortcuts } from "@/lib/shortcuts";
import { usePlaySession } from "./draft-context";
import { outputCount, outputKindOf } from "./output-kind";
import { PlanAllowance } from "./plan-allowance";
import type { SetupProblem } from "./problems";
import { pageVideos, pendingReviewUpload, queued, startLabel } from "./review-state";
import { estimateHeadline, RunReview } from "./run-review";

// One spoken minute is about this many words, so the expected length reads in minutes.
const wordsPerMinute = 150;

export type StartReason =
  | { readonly kind: "problem"; readonly text: string; readonly problem: SetupProblem }
  | { readonly kind: "error"; readonly text: string }
  | { readonly kind: "wait"; readonly text: string };

// Why the Make button can't start right now, as the next thing to do. Undefined while it can.
export function startReason({
  review,
  problems,
  pendingUpload,
}: {
  readonly review: ReturnType<typeof usePlaySession>["review"];
  readonly problems: readonly SetupProblem[];
  readonly pendingUpload: string | undefined;
}): StartReason | undefined {
  if (review.starting) return undefined;
  if (review.uncertain)
    return {
      kind: "wait",
      text: "Slopify didn't confirm the last start. Press Check whether it started to find out before starting again.",
    };
  const next = problems[0];
  if (next !== undefined) return { kind: "problem", text: next.hint, problem: next };
  if (pendingUpload) return { kind: "wait", text: "Wait for the uploads to finish first" };
  if (review.error) return { kind: "error", text: review.error };
  if (review.pending || !review.valid)
    return { kind: "wait", text: "Checking your setup and the estimate…" };
  return undefined;
}

// The right rail of Create, top to bottom: how many it makes, how long, the Make button with
// the one next thing to do under it, what it costs, the whole summary, and the style preview.
// On a phone it follows the form, the button first.
export function StartRail({
  problems,
  saveProblem,
  onStart,
  onFix,
  onWholeSetup,
  preview,
  previewLine,
  keyHere = true,
}: {
  readonly problems: readonly SetupProblem[];
  readonly saveProblem: string | undefined;
  // Starts the run.
  readonly onStart: () => void;
  // Opens the row (or field) that holds the problem.
  readonly onFix: (problem: SetupProblem) => void;
  readonly onWholeSetup: () => void;
  // The style preview, shown in a dialog on demand; undefined when nothing is drawn.
  readonly preview?: ReactNode;
  // What the preview shows, in words: "Captions: Barlow 48, at the bottom".
  readonly previewLine?: string | undefined;
  // False on a phone, where the Make button rides in the bar at the bottom (MakeBar).
  readonly keyHere?: boolean;
}): ReactElement {
  const session = usePlaySession();
  const { document, review } = session;
  const pendingUpload = pendingReviewUpload(document, session.view);
  const locked = review.starting || review.uncertain;
  useEffect(() => {
    void session.reviewDraft();
  }, [session.reviewDraft]);
  // A prompt edited in another tab or in Prompts is read again when the person comes back,
  // quietly: the button and the estimate stay as they are unless the answer differs.
  useEffect(() => {
    const page = window.document;
    const again = () => {
      if (page.visibilityState === "visible") void session.reviewDraft({ quiet: true });
    };
    window.addEventListener("focus", again);
    page.addEventListener("visibilitychange", again);
    return () => {
      window.removeEventListener("focus", again);
      page.removeEventListener("visibilitychange", again);
    };
  }, [session.reviewDraft]);
  // Every edit leaves the review stale; it is checked again once typing pauses, so the
  // estimate and the button are always about what is on screen.
  const stale =
    !review.valid &&
    !review.pending &&
    !review.starting &&
    !review.uncertain &&
    review.error === null &&
    problems.length === 0 &&
    !pendingUpload &&
    session.activeId !== null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: each edit restarts the pause.
  useEffect(() => {
    if (!stale) return;
    const timer = setTimeout(() => void session.reviewDraft(), 800);
    return () => clearTimeout(timer);
  }, [stale, document, session.reviewDraft]);
  const count = review.valid && review.receipt ? review.receipt.runs.length : pageVideos(document);
  const kind = outputKindOf(document.form);
  return (
    <>
      <section aria-label="Start" className="flex min-w-0 flex-col gap-3">
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="font-semibold">{outputCount(kind, count)}</span>
          {count > 1 ? (
            // A choice of two, not a lime switch: the Make button under it is the one lime
            // control here.
            <Segmented
              label="How they run"
              value={queued(document) ? "queue" : "together"}
              options={[
                { value: "queue", label: "One after another", disabled: locked },
                { value: "together", label: "All at once", disabled: locked },
              ]}
              help={
                queued(document)
                  ? "Each starts when the one before finishes."
                  : "They all start together."
              }
              onChange={(next) => session.edit({ ...document, queue: next === "queue" })}
            />
          ) : null}
        </div>
        {document.form.sources.article === "generate" ? (
          <ExpectedLength narrated={document.form.sources.audio !== "off"} locked={locked} />
        ) : null}
        {saveProblem ? <Callout tone="danger" title={saveProblem} /> : null}
        {keyHere ? <MakeButton problems={problems} onStart={onStart} onFix={onFix} tour /> : null}
        {/* Under the button, so the button never moves when the estimate arrives or its
            stages open. */}
        <div className="flex min-w-0 flex-col gap-2">
          {review.valid && review.receipt ? (
            <RunReview estimates={review.receipt.estimates} />
          ) : (
            <p role="status" className="m-0 text-small text-ink-2">
              {review.pending || problems.length === 0
                ? "Estimated cost: calculating…"
                : "Estimated cost: shown once nothing is missing."}
            </p>
          )}
          <PlanAllowance form={document.form} />
        </div>
        <Button
          variant="quiet"
          size="small"
          className="self-center"
          aria-keyshortcuts={ariaKeyShortcuts(shortcuts.reviewSetup)}
          onClick={onWholeSetup}
        >
          See everything this run will do
        </Button>
      </section>
      {preview === undefined ? null : (
        <StylePreviewEntry line={previewLine}>{preview}</StylePreviewEntry>
      )}
    </>
  );
}

// The Make button, and under it the one next thing to do as a button that goes there (or why
// it waits). The rail shows it; so does the summary drawer's foot where the drawer covers the
// rail.
export function MakeButton({
  problems,
  onStart,
  onFix,
  tour = false,
}: {
  readonly problems: readonly SetupProblem[];
  readonly onStart: () => void;
  readonly onFix: (problem: SetupProblem) => void;
  // The guided tour points at the rail's button only.
  readonly tour?: boolean;
}): ReactElement {
  const session = usePlaySession();
  const { document, review } = session;
  const pendingUpload = pendingReviewUpload(document, session.view);
  const locked = review.starting || review.uncertain;
  const reason = startReason({ review, problems, pendingUpload });
  const disabled =
    review.starting ||
    (!review.uncertain &&
      (!review.valid || review.pending || problems.length > 0 || Boolean(pendingUpload)));
  const reasonId = useId();
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <PlayKey
        {...(tour ? { "data-tour": "play-start" } : {})}
        disabled={disabled}
        aria-describedby={reason ? reasonId : undefined}
        onClick={onStart}
      >
        <PlayIcon aria-hidden="true" strokeWidth={1.75} />
        {startLabel(review, document)}
      </PlayKey>
      <div id={reasonId} className="flex min-w-0 flex-col items-center text-small">
        {reason === undefined ? null : reason.kind === "problem" ? (
          <Button
            variant="quiet"
            size="small"
            className="h-auto min-h-8 whitespace-normal text-waiting"
            onClick={() => onFix(reason.problem)}
          >
            {reason.text}
            <ArrowRightIcon aria-hidden="true" strokeWidth={1.75} />
          </Button>
        ) : reason.kind === "error" ? (
          <>
            <span role="alert" className="text-center text-danger">
              {reason.text}
            </span>
            <Button
              variant="quiet"
              size="small"
              disabled={review.pending || locked}
              onClick={() => {
                void session.reviewDraft();
              }}
            >
              Check again
            </Button>
          </>
        ) : (
          <span role="status" className="text-center text-ink-2">
            {reason.text}
          </span>
        )}
      </div>
    </div>
  );
}

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (listener) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", listener);
      return () => list.removeEventListener("change", listener);
    },
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
    () => false,
  );
}
// Below 1024px there is no room for the summary drawer beside the rail (it would cover half of
// it), so it covers the whole window, rail and all, with the Make button in its foot.
export function useNarrow(): boolean {
  return useMedia("(max-width: 1023px)");
}
// A phone: the rail follows the whole form, so the Make button rides in a bar pinned above the
// bottom navigation instead, in reach from the topic on.
export function usePhone(): boolean {
  return useMedia("(max-width: 767px)");
}

// The Make button pinned to the bottom of a phone's screen, over the form, with the one next
// thing to do (or what it costs) under it.
export function MakeBar({
  problems,
  onStart,
  onFix,
}: {
  readonly problems: readonly SetupProblem[];
  readonly onStart: () => void;
  readonly onFix: (problem: SetupProblem) => void;
}): ReactElement {
  const { review } = usePlaySession();
  const ready = review.valid && review.receipt !== null && problems.length === 0;
  return (
    <div
      data-slot="make-bar"
      className="sticky bottom-[calc(48px+max(12px,env(safe-area-inset-bottom)))] z-20 -mx-4 mt-4 flex flex-col gap-1 border-t border-line bg-surface px-4 py-2"
    >
      <MakeButton problems={problems} onStart={onStart} onFix={onFix} tour />
      {ready && review.receipt ? (
        <p className="m-0 text-center text-small text-ink-2">
          {estimateHeadline(review.receipt.estimates)}
        </p>
      ) : null}
    </div>
  );
}

// "Expected length: about 10 min · 1,500 words", and the pencil to change the words. It only
// feeds the estimate and how many images a long video gets; the article prompt decides the
// real length.
function ExpectedLength({
  narrated,
  locked,
}: {
  readonly narrated: boolean;
  readonly locked: boolean;
}): ReactElement {
  const session = usePlaySession();
  const { document } = session;
  const [editing, setEditing] = useState(false);
  const words = Number(document.expectedWords);
  const known = Number.isFinite(words) && words > 0;
  const minutes = known ? Math.round(words / wordsPerMinute) : 0;
  const length = !known
    ? "not set"
    : `about ${narrated ? `${minutes < 1 ? "under a minute" : `${String(minutes)} min`} · ` : ""}${words.toLocaleString("en-US")} words`;
  if (editing)
    return (
      <div className="flex min-w-0 flex-col items-end gap-1">
        <Field
          label="Words per video"
          help="About 150 words is one minute. The article prompt decides the real length."
          className="w-full min-w-0"
        >
          <Input
            data-play-field="expectedWords"
            type="number"
            min={1}
            max={100000}
            autoFocus
            value={document.expectedWords}
            disabled={locked}
            onChange={(event) => session.edit({ ...document, expectedWords: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "Escape") setEditing(false);
            }}
          />
        </Field>
        <Button variant="quiet" size="small" onClick={() => setEditing(false)}>
          Done
        </Button>
      </div>
    );
  return (
    <p className="m-0 flex min-w-0 flex-wrap items-center gap-x-1 text-small text-ink-2">
      <span>Expected length: {length}</span>
      <Button
        variant="quiet"
        size="small"
        disabled={locked}
        aria-label="Change the expected length"
        onClick={() => setEditing(true)}
      >
        <PencilIcon aria-hidden="true" strokeWidth={1.75} />
        Change
      </Button>
    </p>
  );
}

// The style preview on demand: what it shows in words, and a button that renders six seconds
// of the sample with these captions and this look, in a dialog with its own player.
function StylePreviewEntry({
  line,
  children,
}: {
  readonly line: string | undefined;
  readonly children: ReactNode;
}): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <section
      aria-label="Style preview"
      className="flex min-h-10 min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line pt-3 text-small"
    >
      <span className="min-w-0 text-ink-2">{line}</span>
      <Button variant="quiet" size="small" onClick={() => setOpen(true)}>
        Watch a 6-second preview
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Preview with your captions and look"
        footer={
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Close
          </Button>
        }
      >
        {open ? children : null}
      </Dialog>
    </section>
  );
}
