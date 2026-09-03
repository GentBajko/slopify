import type { FieldError } from "@/api";
import { SlotChip } from "@/components/slot-chip";

// The editor's right-hand panel: every `{{name}}` the body holds, and beneath them the
// lint the shared rule found (uiux/screens/05-prompt-editor.md). The lint is text, not a
// colour: the red mark in the body is the same problem said twice, and `lintId` is what
// the textarea points its `aria-describedby` at.
export function DetectedSlots({
  slots,
  body,
  lint,
  lintId,
  // What a body with no slots does instead. A prompt runs as written; an intro is
  // narrated or instructs, so 09 hands its own sentence in rather than calling a
  // narrated opener a prompt (uiux/screens/09-intros-outros.md).
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
      <h2 className="engraved text-ink3">Detected slots</h2>

      {slots.length > 0 ? (
        <div className="flex flex-wrap gap-[6px]">
          {slots.map((slot) => (
            <SlotChip key={slot} name={slot} className="px-2 py-[3px]" />
          ))}
        </div>
      ) : body.trim() === "" ? (
        <p className="text-small text-ink3">{"Slots appear here as you type {{name}}."}</p>
      ) : (
        <p className="text-small text-ink2">{noSlots}</p>
      )}

      {lint.length === 0 ? null : (
        <div id={lintId} className="flex flex-col gap-[6px] border-t border-line pt-3">
          <span className="engraved text-red">
            {lint.length === 1 ? "1 slot error" : `${String(lint.length)} slot errors`}
          </span>
          {lint.map((problem) => (
            <span key={problem.message} className="text-small text-red">
              {problem.message}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
