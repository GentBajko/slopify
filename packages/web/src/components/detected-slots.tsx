import type { KeywordPlace } from "@app/slices/keywords/model.js";
import { keywordOf } from "@app/slices/keywords/specs.js";
import type { FieldError } from "@/api";
import { keywordLabel } from "@/components/keyword-insert-bar";
import { Button } from "@/components/kit/button";
import { SectionHead } from "@/components/kit/section-head";
import { OldKeywordNames } from "@/components/old-keyword-names";
import { SlotChip } from "@/components/slot-chip";
import { keywordSlots } from "@/lib/draft-lint";

// The editor's right-hand panel: what the text asks you for each time (every `{{keyword}}` of
// your own, which becomes a question on Create), apart from the keywords Slopify fills, Update
// to new names for an old keyword name, and beneath them the warnings Save lets through and the
// errors the shared rule found. The errors are text, not a colour: the red mark in the text is
// the same problem said twice, and `lintId` is what the textarea points its `aria-describedby`
// at.
export function DetectedSlots({
  slots,
  body,
  lint,
  lintId,
  warnings = [],
  place,
  bodyId,
  onChange,
  // What a text with no keywords does instead. A prompt runs as written; an intro is narrated
  // or instructs, so its editor hands its own sentence in.
  noSlots = "It asks you for nothing: it runs as written.",
}: {
  readonly slots: readonly string[];
  readonly body: string;
  readonly lint: readonly FieldError[];
  readonly lintId: string;
  readonly noSlots?: string;
  // What Save lets through but Create refuses: a keyword where it can't be filled.
  readonly warnings?: readonly FieldError[];
  // Where the text runs and how to change it, for Update to new names.
  readonly place?: KeywordPlace;
  // The textarea a Go to button puts the caret in.
  readonly bodyId?: string;
  readonly onChange?: (next: string) => void;
}) {
  const { own, filled } = keywordSlots(slots);
  const go = (at: number) => showInBody(lintId, at, bodyId);
  return (
    <>
      <SectionHead title="Asks you for" size="small" className="pb-0" />

      {own.length > 0 ? (
        <>
          <ul aria-label="Your keywords" className="m-0 flex list-none flex-wrap gap-2 p-0">
            {own.map((slot) => (
              <li key={slot} className="flex">
                <SlotChip name={slot} className="px-2 py-1 text-ink" />
              </li>
            ))}
          </ul>
          <p className="m-0 text-small text-ink-2">
            Each keyword becomes a question on Create, answered each time you make a video.
          </p>
        </>
      ) : body.trim() === "" ? (
        <p className="m-0 text-small text-ink-2">
          {
            "Type {{Topic}} where the video's subject goes. Each keyword becomes a question on Create."
          }
        </p>
      ) : filled.length > 0 ? (
        <p className="m-0 text-small text-ink-2">
          It asks you for nothing: Slopify fills every keyword here.
        </p>
      ) : (
        <p className="m-0 text-small text-ink-2">{noSlots}</p>
      )}

      {filled.length === 0 ? null : (
        <div className="flex flex-col gap-2">
          <span className="sl-kicker">Slopify fills in</span>
          <ul
            aria-label="Keywords Slopify fills"
            className="m-0 flex list-none flex-wrap gap-2 p-0"
          >
            {filled.map((slot) => (
              <li key={slot} className="flex">
                <SlotChip
                  name={keywordLabel(keywordOf(slot)?.name ?? slot)}
                  className="px-2 py-1 font-sans text-accent-ink"
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {place === undefined || onChange === undefined ? null : (
        <OldKeywordNames body={body} place={place} onChange={onChange} />
      )}

      {warnings.length === 0 ? null : (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <span className="sl-kicker text-waiting">
            {warnings.length === 1
              ? "1 keyword warning"
              : `${String(warnings.length)} keyword warnings`}
          </span>
          {warnings.map((warning) => (
            <Problem key={warning.message} body={body} message={warning.message} onGo={go} />
          ))}
        </div>
      )}

      {lint.length === 0 ? null : (
        <div id={lintId} className="flex flex-col gap-2 border-t border-line pt-3">
          <span className="sl-kicker text-danger">
            {lint.length === 1 ? "1 keyword error" : `${String(lint.length)} keyword errors`}
          </span>
          {lint.map((problem) => (
            <Problem
              key={problem.message}
              body={body}
              message={problem.message}
              tone="text-danger"
              onGo={go}
            />
          ))}
        </div>
      )}
    </>
  );
}

function Problem({
  body,
  message,
  tone = "text-ink",
  onGo,
}: {
  readonly body: string;
  readonly message: string;
  readonly tone?: string;
  readonly onGo: (at: number) => void;
}) {
  const at = offsetOf(body, message);
  return (
    <span className="flex flex-col items-start gap-1">
      <span className={`text-small ${tone}`}>{message}</span>
      {at === undefined ? null : (
        <Button variant="quiet" size="small" onClick={() => onGo(at)}>
          {`Go to ${where(message) ?? "it"}`}
        </Button>
      )}
    </span>
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

// Puts the caret on the marked `{{` in the body this list describes: the textarea named, or the
// one whose `aria-describedby` names the list.
function showInBody(lintId: string, at: number, bodyId?: string): void {
  const box =
    (bodyId === undefined ? null : document.getElementById(bodyId)) ??
    document.querySelector(`textarea[aria-describedby~="${lintId}"]`);
  if (!(box instanceof HTMLTextAreaElement)) return;
  box.focus();
  box.setSelectionRange(at, Math.min(at + 2, box.value.length));
}
