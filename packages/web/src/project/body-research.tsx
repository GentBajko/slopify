import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { ConfirmedButton } from "./controls.js";
import { ActionRow, Instructions, OutputDownload, OutputText, StageBody } from "./parts.js";

// Research: the notes in a 75 ch measure; 'Show instructions' toggle; Download.
export function ResearchBody({ stage, outputs, actions, busy }: BodyProps) {
  const mine = outputsOf(outputs, stage);
  const notes = roleOf(mine, "notes");

  return (
    <StageBody>
      {notes === undefined ? (
        <p className="text-small text-ink2">No notes were written.</p>
      ) : (
        <OutputText output={notes} />
      )}
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
    </StageBody>
  );
}
