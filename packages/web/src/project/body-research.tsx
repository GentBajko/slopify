import type { Stage } from "@app/slices/admission/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { LiveWriting } from "./live-writing.js";
import { OutputText } from "./parts.js";

// The Article section's Research tab: the notes in a 75 ch measure, and the live writing above
// them while the research runs. Its actions sit in the Article body's action row with the tab.
export function ResearchNotes({
  projectId,
  stage,
  notes,
}: {
  readonly projectId: string;
  readonly stage: Stage;
  readonly notes: Output | undefined;
}) {
  const running = stage.state === "running";
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {running ? <LiveWriting projectId={projectId} stage="research" className="" /> : null}
      {running && notes === undefined ? null : (
        <section
          aria-label="Research notes"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users need to scroll this reading region.
          tabIndex={0}
          className="max-h-[min(58vh,640px)] min-h-48 overflow-auto pr-3"
        >
          {notes === undefined ? (
            <p className="text-small text-ink2">{missing(stage)}</p>
          ) : (
            <OutputText output={notes} />
          )}
        </section>
      )}
    </div>
  );
}

function missing(stage: Stage): string {
  switch (stage.state) {
    case "failed":
    case "canceled":
      return "Research stopped before any notes were saved. Use Retry research above to try again.";
    case "pending":
      return "The research runs first; its notes appear here when it finishes.";
    default:
      return "No notes were written.";
  }
}
