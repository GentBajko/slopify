import type { ReactElement } from "react";
import { CheckpointControls } from "./checkpoints";
import { PlayReviews } from "./reviews";

// Create's Pauses and checks row, opened in place like every other row: where the run stops for
// the person's approval, then whether an AI checks what it makes.
export function PausesAndChecks({
  problem,
}: {
  readonly problem: (field: string) => string | undefined;
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-4 py-4">
      <CheckpointControls problem={problem} />
      <div className="border-t border-line pt-4">
        <PlayReviews problem={problem} />
      </div>
    </div>
  );
}
