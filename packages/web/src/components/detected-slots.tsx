import type { FieldError } from "@/api";
import { Button } from "@/components/kit/button";
import { SectionHead } from "@/components/kit/section-head";
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
      <SectionHead title="Detected slots" info="library.slots" size="small" className="pb-0" />

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
          {lint.map((problem) => {
            const at = offsetOf(body, problem.message);
            return (
              <span key={problem.message} className="flex flex-col items-start gap-1">
                <span className="text-small text-danger">{problem.message}</span>
                {at === undefined ? null : (
                  <Button variant="quiet" size="small" onClick={() => showInBody(lintId, at)}>
                    {`Go to ${where(problem.message) ?? "it"}`}
                  </Button>
                )}
              </span>
            );
          })}
        </div>
      )}
    </>
  );
}

const position = /line (\d+), column (\d+)/;

function where(message: string): string | undefined {
  return position.exec(message)?.[0];
}

// The offset a lint sentence's "line 3, column 12" points at, counted as the lint counts.
export function offsetOf(body: string, message: string): number | undefined {
  const match = position.exec(message);
  if (match === null) return undefined;
  const lines = body.split("\n");
  const line = Number(match[1]);
  const column = Number(match[2]);
  if (line < 1 || line > lines.length) return undefined;
  const start = lines.slice(0, line - 1).reduce((sum, one) => sum + one.length + 1, 0);
  return start + column - 1;
}

// Puts the caret on the marked `{{` in the body this list describes: the textarea is the one
// whose `aria-describedby` names the list.
function showInBody(lintId: string, at: number): void {
  const box = document.querySelector(`textarea[aria-describedby~="${lintId}"]`);
  if (!(box instanceof HTMLTextAreaElement)) return;
  box.focus();
  box.setSelectionRange(at, Math.min(at + 2, box.value.length));
}
