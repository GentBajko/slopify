import type { FieldError } from "@app/slices/admission/rules.js";
import type { Field } from "@app/slices/admission/substitute.js";
import { type ReactElement, useEffect, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePlaySession } from "./draft-context";
import { pendingReviewUpload } from "./review-state";
import { BatchEditor, RunReview } from "./run-review";

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
  const wordsId = useId();
  const pendingUploads = pendingReviewUpload(document, session.view);
  const locked = review.starting || review.uncertain;
  useEffect(() => {
    void session.reviewDraft();
  }, [session.reviewDraft]);
  const runs = review.valid ? (review.receipt?.runs ?? []) : [];
  return (
    <div className="flex min-w-0 flex-col gap-6 py-6">
      <p className="text-body text-ink2">Check your setup and estimated costs before starting.</p>
      {errors.length ? (
        <ul aria-label="Setup errors" className="text-small text-red">
          {errors.map((error) => (
            <li key={`${error.field}-${error.message}`}>
              <Button variant="ghost" onClick={() => onReveal(error.field)}>
                {error.message}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {pendingUploads ? (
        <Button variant="ghost" onClick={() => onReveal(pendingUploads)}>
          Wait for uploads to finish before Start
        </Button>
      ) : null}
      {review.error ? (
        <p role="alert" className="text-body text-red">
          {review.error}
        </p>
      ) : null}
      <div className="border-t border-line pt-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Content</h3>
          <Button variant="ghost" onClick={() => onReveal("title")}>
            Edit content ↗
          </Button>
        </div>
        <dl className="grid grid-cols-[100px_minmax(0,1fr)] gap-x-4 gap-y-2 text-body sm:grid-cols-[145px_minmax(0,1fr)]">
          <dt className="text-ink2">Project</dt>
          <dd className="break-words font-medium">{form.title || "Untitled run"}</dd>
          <dt className="text-ink2">Article</dt>
          <dd>
            {form.sources.article === "generate"
              ? `Generate · ${form.articlePrompt}`
              : "Your article"}
          </dd>
          <dt className="text-ink2">Research</dt>
          <dd>{form.sources.research}</dd>
          {form.sources.article === "generate" || form.sources.thumbnail === "prompt_by_llm" ? (
            <>
              <dt className="text-ink2">Text provider</dt>
              <dd>
                {form.llm.provider} · {form.llm.model}
              </dd>
            </>
          ) : null}
          {Object.entries(form.values)
            .filter(([name]) => fields.some((field) => field.name === name))
            .map(([name, value]) => (
              <div key={name} className="contents">
                <dt className="break-words text-ink2">{name}</dt>
                <dd className="whitespace-pre-wrap break-words">{value}</dd>
              </div>
            ))}
        </dl>
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
                    <h5 className="text-small text-ink2">{name}</h5>
                    <p className="whitespace-pre-wrap break-words text-body">{text}</p>
                  </div>
                ))}
              </div>
            ))
          ) : (
            <p className="mt-3 text-small text-ink2">
              Refresh review to read the exact resolved inputs.
            </p>
          )}
        </details>
      </div>
      <div className="border-t border-line pt-5">
        <div className="mb-4 flex justify-between">
          <h3 className="font-semibold">Outputs &amp; style</h3>
          <Button variant="ghost" onClick={() => onReveal("sources.audio")}>
            Edit outputs ↗
          </Button>
        </div>
        <dl className="grid grid-cols-[100px_minmax(0,1fr)] gap-2 text-body sm:grid-cols-[145px_minmax(0,1fr)]">
          <dt className="text-ink2">Narration</dt>
          <dd>
            {form.sources.audio}
            {form.sources.audio === "generate"
              ? ` · ${form.audio.provider} · ${form.audio.voice}`
              : ""}
          </dd>
          <dt className="text-ink2">Images</dt>
          <dd>
            {form.sources.images}
            {form.sources.images === "generate"
              ? ` · ${form.imagePrompts.reduce((n, p) => n + Number(p.number || 0), 0)} images`
              : ""}
          </dd>
          <dt className="text-ink2">Video</dt>
          <dd>{form.sources.video}</dd>
          <dt className="text-ink2">Frame</dt>
          <dd>{form.format}</dd>
          <dt className="text-ink2">Subtitles</dt>
          <dd>
            {form.subtitles.mode}
            {form.subtitles.mode === "off"
              ? ""
              : ` · ${form.subtitles.fontId} · ${form.subtitles.fontSize} px`}
          </dd>
        </dl>
      </div>
      <fieldset disabled={locked} className="min-w-0">
        <BatchEditor
          fields={fields}
          items={document.variants.map(({ id, ...item }) => ({ ...item, key: id }))}
          title={form.title}
          values={form.values}
          problem={problem}
          onChange={(items) =>
            session.edit({
              ...document,
              variants: items.map(({ key, ...item }) => ({ ...item, id: key })),
            })
          }
        />
      </fieldset>
      <div className="flex flex-col gap-4 border-t border-line pt-5">
        <h3 className="font-semibold">Estimated cost</h3>
        <label htmlFor={wordsId} className="text-body">
          Expected article words per video
          <Input
            id={wordsId}
            data-play-field="expectedWords"
            type="number"
            min={1}
            max={100000}
            value={document.expectedWords}
            disabled={locked}
            onChange={(event) => session.edit({ ...document, expectedWords: event.target.value })}
          />
        </label>
        <p className="text-small text-ink2">
          Estimated provider charges in USD. Actual usage can differ. This estimate does not cap
          spending.
        </p>
        {review.pending ? <p role="status">Calculating estimate…</p> : null}
        {review.valid && review.receipt ? (
          <RunReview estimates={review.receipt.estimates} />
        ) : (
          <p className="text-small text-ink2">Review needs refreshing before Start.</p>
        )}
        <Button
          disabled={review.pending || locked || Boolean(pendingUploads)}
          onClick={() => {
            void session.reviewDraft();
          }}
        >
          Refresh review
        </Button>
      </div>
      <div className="flex justify-between gap-3 border-t border-line pt-5">
        <Button
          variant="ghost"
          onClick={() => {
            void session.navigate("style");
          }}
        >
          ← Style
        </Button>
        <Button
          variant="play"
          data-tour="play-start"
          disabled={
            review.starting ||
            (!review.uncertain &&
              (!review.valid || review.pending || errors.length > 0 || Boolean(pendingUploads)))
          }
          onClick={() => {
            void session.startRun();
          }}
        >
          {review.starting
            ? "Starting…"
            : review.uncertain
              ? "Check Start result"
              : document.variants.length
                ? `Queue ${document.variants.length + 1} videos`
                : "Start run"}
        </Button>
      </div>
    </div>
  );
}
