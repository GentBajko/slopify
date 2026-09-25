import type { ManualCue } from "@app/slices/revisions/model.js";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";

export function CaptionEditor({
  cues,
  duration,
  onChange,
  onPending,
}: {
  readonly cues: readonly ManualCue[];
  readonly duration: number;
  readonly onChange: (cues: readonly ManualCue[]) => void;
  readonly onPending: (pending: boolean) => void;
}): import("react").ReactElement {
  const editorId = useId();
  const [draft, setDraft] = useState(() =>
    cues.map((cue) => ({ ...cue, start: String(cue.start), end: String(cue.end) })),
  );
  const [error, setError] = useState<string | undefined>();
  const [dirty, setDirty] = useState(false);
  const pending = useRef(onPending);
  pending.current = onPending;
  useEffect(() => {
    pending.current(dirty);
  }, [dirty]);
  useEffect(() => () => pending.current(false), []);
  function apply(): void {
    const parsed: ManualCue[] = [];
    const seen = new Set<string>();
    let previous = 0;
    if (!Number.isFinite(duration) || duration <= 0) {
      setError(
        "The narration length isn't known yet, so captions can't be checked. Reload the page and try again.",
      );
      return;
    }
    for (const [index, cue] of draft.entries()) {
      const start = cue.start.trim() === "" ? NaN : Number(cue.start);
      const end = cue.end.trim() === "" ? NaN : Number(cue.end);
      if (seen.has(cue.id)) {
        setError(`Caption ${index + 1}: this caption is listed twice. Remove the copy.`);
        return;
      }
      seen.add(cue.id);
      if (!Number.isFinite(start) || start < 0 || start < previous) {
        setError(
          `Caption ${index + 1}: start must be a number of seconds, no earlier than the previous caption's end.`,
        );
        return;
      }
      if (!Number.isFinite(end) || end <= start || end > duration) {
        setError(
          `Caption ${index + 1}: end must be after its start and no later than the end of the narration.`,
        );
        return;
      }
      if (cue.text.trim() === "") {
        setError(`Caption ${index + 1}: enter caption text.`);
        return;
      }
      parsed.push({ id: cue.id, text: cue.text, start, end });
      previous = end;
    }
    onChange(parsed);
    setError(undefined);
    setDirty(false);
  }
  return (
    <section aria-label="Edit caption cues" className="space-y-3">
      <h3>Caption text and timing</h3>
      {draft.map((cue, index) => (
        <fieldset key={cue.id} className="space-y-2 rounded-control border border-line2 p-3">
          <legend>Caption {index + 1}</legend>
          <label htmlFor={`${editorId}-${cue.id}-text`} className="block text-small">
            Text for caption {index + 1}
            <Textarea
              id={`${editorId}-${cue.id}-text`}
              value={cue.text}
              onChange={(event) => {
                setDirty(true);
                setDraft(draft.with(index, { ...cue, text: event.target.value }));
              }}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label htmlFor={`${editorId}-${cue.id}-start`} className="block text-small">
              Start for caption {index + 1}
              <Input
                id={`${editorId}-${cue.id}-start`}
                inputMode="decimal"
                value={cue.start}
                onChange={(event) => {
                  setDirty(true);
                  setDraft(draft.with(index, { ...cue, start: event.target.value }));
                }}
              />
            </label>
            <label htmlFor={`${editorId}-${cue.id}-end`} className="block text-small">
              End for caption {index + 1}
              <Input
                id={`${editorId}-${cue.id}-end`}
                inputMode="decimal"
                value={cue.end}
                onChange={(event) => {
                  setDirty(true);
                  setDraft(draft.with(index, { ...cue, end: event.target.value }));
                }}
              />
            </label>
          </div>
        </fieldset>
      ))}
      {error === undefined ? null : (
        <p role="alert" className="text-red">
          {error}
        </p>
      )}
      <Button type="button" onClick={apply}>
        Apply caption edits to draft
      </Button>
      {dirty ? <p>Apply these caption edits before saving the project.</p> : null}
    </section>
  );
}
