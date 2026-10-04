import type { ReactElement, ReactNode } from "react";
import { ActionBar, StatusSlot, type StatusTone } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { InfoTip } from "@/components/kit/info-tip";
import { SectionHead } from "@/components/kit/section-head";
import { startedAt } from "@/lib/utils";
import { DraftLeaveGuard } from "./draft-leave-guard.js";
import { outputLabel } from "./output-label.js";
import { outputStateWords } from "./output-status.js";
import type { RevisionController } from "./revision-controller.js";
import { RevisionFeedback } from "./revision-feedback.js";
import type { EditorProps } from "./revision-workspace.js";

// "14:05" today, "3 Oct 14:05" on another day, with the year once it is not this year's.
const when = (iso: string): string => startedAt(iso);

// The draft's status line: what happened to the draft itself, or the newer revision beside it.
function DraftStatus({ c }: { readonly c: RevisionController }): ReactElement {
  const line = (tone: StatusTone, text: string, actions?: ReactNode) => (
    <StatusSlot tone={tone}>
      <span className="min-w-0 truncate" title={text}>
        {text}
      </span>
      {actions}
    </StatusSlot>
  );
  if (c.uploading) return line("info", "Waiting for uploads to finish…");
  const notice = c.notice;
  if (notice?.kind === "restored")
    return line(
      "info",
      `Restored your unsaved edit from ${when(notice.savedAt)}.`,
      <>
        <Button size="small" variant="quiet" onClick={c.dismissNotice}>
          Keep
        </Button>
        <Button size="small" variant="quiet" onClick={c.discard}>
          Discard
        </Button>
      </>,
    );
  if (notice?.kind === "reapplied")
    return line(
      "info",
      "Your edit is laid over the latest revision. Check it, then press Save changes.",
    );
  if (notice?.kind === "copied")
    return notice.ok
      ? line("success", "Your edit is on the clipboard.")
      : line(
          "error",
          "Couldn't copy: the browser blocked the clipboard. Your edit is still kept here and in this browser.",
        );
  if (c.remoteChanged)
    return line(
      "warning",
      "A newer revision is available. Your unsaved changes are kept below and in this browser.",
    );
  return <StatusSlot />;
}

// The project's settings: the draft editor with its Save, or the button that opens it.
export function RevisionEditPanel({
  controller,
  renderEditor,
  active = true,
  intro,
  projectId,
}: {
  readonly controller: RevisionController;
  readonly renderEditor: (props: EditorProps) => ReactNode;
  // Feedback is said only in the view on screen, so one refusal is not announced twice.
  readonly active?: boolean;
  // Shown above the Edit project button while no draft is open.
  readonly intro?: ReactNode;
  // Guards leaving the project while the draft is unsaved; left out, nothing is guarded.
  readonly projectId?: string;
}): ReactElement {
  const c = controller;
  const guard =
    projectId === undefined ? null : <DraftLeaveGuard projectId={projectId} dirty={c.unsaved} />;
  if (c.view === undefined || c.edit === undefined)
    return (
      <div className="flex flex-col gap-4">
        {guard}
        {intro ?? (
          <>
            <SectionHead title="Saved revision" info="project.saved-revision" />
            {c.saved.error === null ? null : (
              <p role="alert" className="m-0 text-small text-danger">
                {c.saved.error.message}
              </p>
            )}
            {c.saved.data === undefined ? null : (
              <ul aria-label="Saved output status" className="sl-list m-0 list-none p-0">
                {c.saved.data.outputs
                  .filter((output) => output.selected)
                  .map((output) => (
                    <li key={output.recordId} className="sl-row">
                      <span className="sl-row__title">{outputLabel(output.output)}</span>
                      <span className="sl-row__meta">
                        {outputStateWords(output.state, output.output.role, output.available)}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </>
        )}
        {c.preview === undefined && active ? (
          <RevisionFeedback error={c.error} refusal={c.refusal} />
        ) : null}
        <ActionBar
          status={
            c.notice?.kind === "discarded" ? (
              <StatusSlot>
                <span className="min-w-0 truncate">Changes discarded.</span>
                <Button size="small" variant="quiet" onClick={c.undoDiscard}>
                  Undo
                </Button>
              </StatusSlot>
            ) : undefined
          }
        >
          {c.refusal?.reason === "conflict" && active ? (
            <Button disabled={c.pending} onClick={c.reloadCurrent}>
              Reload current revision
            </Button>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <Button
              disabled={c.busy}
              onClick={() => c.review({ kind: "allAffected" })}
              variant="secondary"
            >
              Choose what to remake
            </Button>
            <InfoTip id="project.choose-remake" />
          </span>
          <Button variant="primary" disabled={c.busy} onClick={c.openEditor}>
            Edit project
          </Button>
        </ActionBar>
      </div>
    );
  const conflict = c.remoteChanged || c.refusal?.reason === "conflict";
  return (
    <form
      aria-label="Edit project"
      onSubmit={(event) => {
        event.preventDefault();
        c.save();
      }}
    >
      {guard}
      <fieldset disabled={c.pending} className="m-0 min-w-0 border-0 p-0">
        {renderEditor({
          view: c.view,
          edit: c.edit,
          fields: c.refusal?.fields ?? [],
          onChange: c.setEdit,
          onPending: c.setUploading,
          ...(c.focus === undefined ? {} : { focus: c.focus }),
        })}
      </fieldset>
      {c.preview === undefined ? <RevisionFeedback error={c.error} refusal={c.refusal} /> : null}
      <ActionBar status={<DraftStatus c={c} />}>
        {conflict ? (
          <>
            <Button variant="quiet" disabled={c.pending} onClick={c.copyEdit}>
              Copy my edit
            </Button>
            <Button disabled={c.pending || c.uploading} onClick={c.reapply}>
              Reload latest and re-apply my edit
            </Button>
          </>
        ) : null}
        <Button variant="quiet" disabled={c.pending || c.uploading} onClick={c.discard}>
          Discard changes
        </Button>
        <Button variant="primary" type="submit" disabled={c.pending || c.uploading}>
          Save changes
        </Button>
      </ActionBar>
    </form>
  );
}
