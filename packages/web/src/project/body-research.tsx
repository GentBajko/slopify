import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { ConfirmedButton } from "./controls.js";
import { ActionRow, Instructions, OutputDownload, OutputText, StageBody } from "./parts.js";

// Research: the notes in a 75 ch measure; 'Show instructions' toggle; Download.
export function ResearchBody({ stage, outputs, actions, busy }: BodyProps) {
  const mine = outputsOf(outputs, stage);
  const notes = roleOf(mine, "notes");
  if (stage.state === "running" && notes === undefined) return null;

  return (
    <StageBody>
      <ActionRow>
        <ConfirmedButton
          action={{ kind: "rerun", stage: stage.kind }}
          run={() => {
            actions.run({ kind: "rerun", stage: stage.kind });
          }}
          disabled={busy}
          pending={actions.pending}
        >
          Re-run
        </ConfirmedButton>
        <Instructions output={roleOf(mine, "instructions")} />
        {notes === undefined ? null : <OutputDownload output={notes} />}
      </ActionRow>
      <section
        aria-label="Research notes"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users need to scroll this reading region.
        tabIndex={0}
        className="max-h-[min(58vh,640px)] min-h-48 overflow-auto pr-3"
      >
        {notes === undefined ? (
          <p className="text-small text-ink2">
            {stage.state === "running"
              ? "Research notes will be saved when the writing above finishes."
              : "No notes were written."}
          </p>
        ) : (
          <OutputText output={notes} />
        )}
      </section>
    </StageBody>
  );
}
