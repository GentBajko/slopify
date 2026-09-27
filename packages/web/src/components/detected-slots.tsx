import type { FieldError } from "@/api";
import { InfoTip } from "@/components/kit/info-tip";
import { SlotChip } from "@/components/slot-chip";

// The editor's right-hand panel: every `{{name}}` the body holds, and beneath them the lint the
// shared rule found. The lint is text, not a colour: the red mark in the body is the same
// problem said twice, and `lintId` is what the textarea points its `aria-describedby` at.
export function DetectedSlots({
  slots,
  body,
  lint,
  lintId,
  // What a body with no slots does instead. A prompt runs as written; an intro is
  // narrated or instructs, so 09 hands its own sentence in rather than calling a
  // narrated opener a prompt.
  noSlots = "No slots. This prompt runs as written.",
}: {
  readonly slots: readonly string[];
  readonly body: string;
  readonly lint: readonly FieldError[];
  readonly lintId: string;
  readonly noSlots?: string;
}) {
  return (
    <>
      <div className="flex items-center gap-1">
        <h2 className="sl-kicker m-0">Detected slots</h2>
        <InfoTip id="library.slots" className="-my-1" />
      </div>

      {slots.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {slots.map((slot) => (
            <SlotChip key={slot} name={slot} className="px-2 py-1" />
          ))}
        </div>
      ) : body.trim() === "" ? (
        <p className="m-0 text-small text-ink-3">{"Slots appear here as you type {{name}}."}</p>
      ) : (
        <p className="m-0 text-small text-ink-2">{noSlots}</p>
      )}

      {lint.length === 0 ? null : (
        <div id={lintId} className="flex flex-col gap-2 border-t border-line pt-3">
          <span className="sl-kicker text-danger">
            {lint.length === 1 ? "1 slot error" : `${String(lint.length)} slot errors`}
          </span>
          {lint.map((problem) => (
            <span key={problem.message} className="text-small text-danger">
              {problem.message}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
