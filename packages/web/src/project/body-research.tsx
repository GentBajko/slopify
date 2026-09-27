import type { Stage } from "@app/slices/admission/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { ReadingView } from "@/components/kit/reading-view";
import { LiveWriting } from "./live-writing.js";
import { useOutputText } from "./parts.js";

// The Article section's Research tab: the notes in the reading view, and the live writing above
// them while the research runs. Its actions sit in the Article body's action row with the tab.
export function ResearchNotes({
  projectId,
  stage,
  notes,
  onCopy,
}: {
  readonly projectId: string;
  readonly stage: Stage;
  readonly notes: Output | undefined;
  readonly onCopy: (text: string, what: string) => void;
}) {
  const running = stage.state === "running";
  const text = useOutputText(notes);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {running ? <LiveWriting projectId={projectId} stage="research" className="" /> : null}
      {running && notes === undefined ? null : text.error !== null ? (
        <p className="text-body text-danger">{text.error.message}</p>
      ) : (
        <ReadingView
          markdown={text.data ?? ""}
          label="Research notes"
          regionLabel="Research notes"
          anchorPrefix="research-"
          what="research notes"
          onCopy={onCopy}
          copyAll={false}
        >
          {notes === undefined ? (
            <p className="text-small text-ink-2">{missing(stage)}</p>
          ) : (
            <span className="block h-4 w-[40ch] max-w-full rounded-control bg-raised" />
          )}
        </ReadingView>
      )}
    </div>
  );
}

function missing(stage: Stage): string {
  switch (stage.state) {
    case "failed":
    case "canceled":
      return "Research stopped before any notes were saved. Try the research again with the next action beside it.";
    case "pending":
      return "The research runs first; its notes appear here when it finishes.";
    default:
      return "No notes were written.";
  }
}
