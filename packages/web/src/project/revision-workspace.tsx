import type { RebuildPreview } from "@app/slices/rebuild/model.js";
import type { RevisionEdit, RevisionView } from "@app/slices/revisions/model.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useRef, useState } from "react";
import { readProject } from "@/api";
import { useApp } from "@/app-context";
import { ActionBar, StatusSlot } from "@/components/kit/action-bar";
import { Drawer } from "@/components/kit/drawer";
import { SectionHead } from "@/components/kit/section-head";
import { type TabItem, TabPanel, Tabs } from "@/components/kit/tabs";
import { Button } from "@/components/ui/button";
import { keys } from "@/queries";
import { outputLabel } from "./output-label.js";
import { type RebuildConsent, RebuildReview } from "./rebuild-review.js";
import {
  prepareRevision,
  previewProjectRebuild,
  type RevisionRefusal,
  restoreProjectRevision,
  saveProjectRevision,
  startProjectRebuild,
  viewOf,
} from "./revision-api.js";
import { RevisionFeedback } from "./revision-feedback.js";
import { RevisionHistory } from "./revision-history.js";
import { type RequestMemory, requestFor } from "./revision-requests.js";
export type EditSection =
  | "inputs"
  | "article"
  | "providers"
  | "prompts"
  | "subtitles"
  | "images"
  | "narration"
  | "captions";

export interface EditorProps {
  readonly view: RevisionView;
  readonly edit: RevisionEdit;
  readonly fields: readonly { readonly field: string; readonly message: string }[];
  readonly onChange: (edit: RevisionEdit) => void;
  readonly onPending: (pending: boolean) => void;
  // The one edit section on screen. The others stay mounted, hidden, so an upload or an
  // unapplied caption edit survives a switch. Undefined shows everything.
  readonly section?: EditSection | undefined;
}
export type ProjectTab = "output" | "edit" | "history" | "checkpoints";

// The project page's secondary surfaces are tabs under the rundown, never blocks inserted
// above the output: Edit, History and Checkpoints each replace the Output panel while open,
// and rebuild review opens in a drawer over whichever tab is showing.
export function RevisionWorkspace({
  projectId,
  currentRevisionId,
  renderEditor,
  tab: controlledTab,
  onTab,
  output,
  checkpoints,
  checkpointBadge,
  trailing,
}: {
  readonly projectId: string;
  readonly currentRevisionId: string | null;
  readonly renderEditor: (props: EditorProps) => ReactNode;
  readonly tab?: ProjectTab;
  readonly onTab?: (tab: ProjectTab) => void;
  // The stage output panel. Without it (a unit test of the workspace alone) there is no
  // Output tab and Edit opens first.
  readonly output?: ReactNode;
  readonly checkpoints?: ReactNode;
  readonly checkpointBadge?: string;
  readonly trailing?: ReactNode;
}): import("react").ReactElement {
  const [ownTab, setOwnTab] = useState<ProjectTab>(output === undefined ? "edit" : "output");
  const tab = controlledTab ?? ownTab;
  const selectTab = (next: ProjectTab) => {
    setOwnTab(next);
    onTab?.(next);
  };
  const { api } = useApp();
  const client = useQueryClient();
  const saved = useQuery({
    queryKey: keys.revision(projectId, currentRevisionId ?? ""),
    enabled: currentRevisionId !== null,
    queryFn: async () => {
      if (currentRevisionId === null)
        throw new Error("Prepare this legacy project before inspecting revision status.");
      const result = await viewOf(api, projectId, currentRevisionId);
      if (!result.ok) throw new Error(result.message);
      return result.value.view;
    },
  });
  const [view, setView] = useState<RevisionView | undefined>();
  const [edit, setEdit] = useState<RevisionEdit | undefined>();
  const [preview, setPreview] = useState<RebuildPreview | undefined>();
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [refusal, setRefusal] = useState<RevisionRefusal | undefined>();
  const saveMemory = useRef<RequestMemory | undefined>(undefined);
  const restoreMemory = useRef<RequestMemory | undefined>(undefined);
  const startMemory = useRef<RequestMemory | undefined>(undefined);
  const remoteChanged =
    edit !== undefined &&
    view !== undefined &&
    currentRevisionId !== null &&
    currentRevisionId !== view.revision.id;
  const active = useRef(false);
  async function perform(action: () => Promise<void>): Promise<void> {
    if (active.current) return;
    active.current = true;
    setPending(true);
    setError(undefined);
    setRefusal(undefined);
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      active.current = false;
      setPending(false);
    }
  }
  async function prepare(openEditor: boolean): Promise<RevisionView | undefined> {
    const result = await prepareRevision(api, projectId);
    if (!result.ok) {
      setRefusal(result);
      return undefined;
    }
    setRefusal(undefined);
    setView(result.value.view);
    if (openEditor)
      setEdit({
        config: structuredClone(result.value.view.revision.config),
        content: structuredClone(result.value.view.revision.content),
      });
    return result.value.view;
  }
  async function accepted(next: RevisionView): Promise<void> {
    const latest = await readProject(api, projectId);
    client.setQueryData(keys.project(projectId), latest);
    await client.invalidateQueries({ queryKey: keys.revisions(projectId) });
    if (!next.current || latest.revisionId !== next.revision.id) {
      setRefusal({
        ok: false,
        reason: "conflict",
        message: "The project changed again. Your draft is preserved.",
        currentRevisionId: latest.revisionId,
        fields: [],
      });
      return;
    }
    setView(next);
    setEdit(undefined);
    setRefusal(undefined);
    setPreview(undefined);
  }
  async function save(): Promise<void> {
    if (uploading || view === undefined || edit === undefined) return;
    const payload = { baseRevisionId: view.revision.id, edit };
    const memory = requestFor(saveMemory.current, payload, () => crypto.randomUUID());
    saveMemory.current = memory;
    const result = await saveProjectRevision(api, projectId, {
      ...payload,
      idempotencyKey: memory.idempotencyKey,
    });
    if (!result.ok) {
      setRefusal(result);
      return;
    }
    await accepted(result.value.view);
    saveMemory.current = undefined;
  }
  async function review(): Promise<void> {
    const current = await prepare(false);
    if (current === undefined) return;
    const result = await previewProjectRebuild(api, projectId, {
      baseRevisionId: current.revision.id,
      request: { kind: "allAffected" },
    });
    if (!result.ok) {
      setRefusal(result);
      return;
    }
    setPreview(result.value.value);
    startMemory.current = undefined;
  }
  async function start(consent: RebuildConsent): Promise<void> {
    if (preview === undefined) return;
    const payload = { baseRevisionId: preview.baseRevisionId, previewId: preview.id, ...consent };
    const memory = requestFor(startMemory.current, payload, () => crypto.randomUUID());
    startMemory.current = memory;
    const result = await startProjectRebuild(api, projectId, {
      ...payload,
      idempotencyKey: memory.idempotencyKey,
    });
    if (!result.ok) {
      setRefusal(result);
      if (result.reason === "stale-preview" || result.reason === "conflict") setPreview(undefined);
      return;
    }
    startMemory.current = undefined;
    setPreview(undefined);
    await client.invalidateQueries({ queryKey: keys.project(projectId) });
  }
  async function restore(targetRevisionId: string): Promise<void> {
    const current = view ?? saved.data ?? (await prepare(false));
    if (current === undefined) return;
    const payload = { baseRevisionId: current.revision.id, targetRevisionId };
    const memory = requestFor(restoreMemory.current, payload, () => crypto.randomUUID());
    restoreMemory.current = memory;
    const result = await restoreProjectRevision(api, projectId, {
      ...payload,
      idempotencyKey: memory.idempotencyKey,
    });
    if (!result.ok) {
      setRefusal(result);
      return;
    }
    await accepted(result.value.view);
    restoreMemory.current = undefined;
  }
  const busy = pending || uploading || edit !== undefined || preview !== undefined;
  const reloadCurrent = (
    <Button
      type="button"
      disabled={pending}
      onClick={() =>
        void perform(async () => {
          restoreMemory.current = undefined;
          startMemory.current = undefined;
          setPreview(undefined);
          await prepare(false);
          await client.invalidateQueries({ queryKey: keys.project(projectId) });
        })
      }
    >
      Reload current revision
    </Button>
  );
  const tabs: TabItem<ProjectTab>[] = [
    ...(output === undefined ? [] : [{ id: "output" as const, label: "Output" }]),
    {
      id: "edit",
      label: "Edit",
      ...(edit === undefined ? {} : { badge: "· unsaved" }),
    },
    { id: "history", label: "History" },
    ...(checkpoints === undefined
      ? []
      : [
          {
            id: "checkpoints" as const,
            label: "Checkpoints",
            ...(checkpointBadge === undefined ? {} : { badge: checkpointBadge }),
          },
        ]),
  ];
  return (
    <section aria-label="Project revisions">
      <Tabs
        items={tabs}
        value={tab}
        onChange={selectTab}
        label="Project views"
        idPrefix="project"
        trailing={trailing}
        className="mb-4"
      />
      {output === undefined ? null : (
        <TabPanel idPrefix="project" id="output" active={tab === "output"}>
          {output}
        </TabPanel>
      )}
      <TabPanel idPrefix="project" id="edit" active={tab === "edit"}>
        {view === undefined || edit === undefined ? (
          <div>
            <SectionHead
              title="Saved revision"
              info="Resume uses the current saved revision. Edit project saves a new revision without starting work; Rebuild affected outputs opens optional Advanced rebuild review for selection, cost details and supplied-content confirmation."
            />
            {saved.error === null ? null : (
              <p role="alert" className="mb-3 text-small text-red">
                {saved.error.message}
              </p>
            )}
            {saved.data === undefined ? null : (
              <ul
                aria-label="Saved output status"
                className="overflow-hidden rounded-panel border border-line bg-panel"
              >
                {saved.data.outputs
                  .filter((output) => output.selected)
                  .map((output) => (
                    <li
                      key={output.recordId}
                      className="flex flex-wrap justify-between gap-x-4 border-b border-line px-4 py-2 text-small last:border-b-0"
                    >
                      <span className="font-semibold">{outputLabel(output.output)}: </span>
                      <span className="text-ink2">
                        {output.available
                          ? output.state === "ready"
                            ? "Ready"
                            : output.state === "outdated"
                              ? "Needs rebuild; retained output available"
                              : "Provided content needs review"
                          : "Retained file missing"}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
            {preview === undefined && tab === "edit" ? (
              <RevisionFeedback error={error} refusal={refusal} />
            ) : null}
            <ActionBar>
              {refusal?.reason === "conflict" && tab === "edit" ? reloadCurrent : null}
              <Button type="button" disabled={busy} onClick={() => void perform(review)}>
                Rebuild affected outputs
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await prepare(true);
                  })
                }
              >
                Edit project
              </Button>
            </ActionBar>
          </div>
        ) : (
          <form
            aria-label="Edit project"
            onSubmit={(event) => {
              event.preventDefault();
              void perform(save);
            }}
          >
            <fieldset disabled={pending} className="min-w-0">
              {renderEditor({
                view,
                edit,
                fields: refusal?.fields ?? [],
                onChange: setEdit,
                onPending: setUploading,
              })}
            </fieldset>
            {preview === undefined ? <RevisionFeedback error={error} refusal={refusal} /> : null}
            <ActionBar
              status={
                <StatusSlot tone={remoteChanged ? "warning" : "info"}>
                  {remoteChanged
                    ? "A newer revision is available. Your unsaved changes are kept below."
                    : uploading
                      ? "Waiting for uploads to finish…"
                      : undefined}
                </StatusSlot>
              }
            >
              {remoteChanged || refusal?.reason === "conflict" ? (
                <Button
                  type="button"
                  disabled={pending || uploading}
                  onClick={() =>
                    void perform(async () => {
                      saveMemory.current = undefined;
                      setUploading(false);
                      await prepare(true);
                      setRefusal(undefined);
                    })
                  }
                >
                  Reload current revision and discard my draft
                </Button>
              ) : null}
              <Button
                type="button"
                disabled={pending || uploading}
                onClick={() => {
                  setEdit(undefined);
                  setRefusal(undefined);
                  setUploading(false);
                  saveMemory.current = undefined;
                }}
              >
                Discard changes
              </Button>
              <Button variant="primary" type="submit" disabled={pending || uploading}>
                Save changes
              </Button>
            </ActionBar>
          </form>
        )}
      </TabPanel>
      <TabPanel idPrefix="project" id="history" active={tab === "history"}>
        {tab === "history" && preview === undefined && (error || refusal) ? (
          <div className="mb-4 space-y-3">
            <RevisionFeedback error={error} refusal={refusal} />
            {edit === undefined && refusal?.reason === "conflict" ? reloadCurrent : null}
          </div>
        ) : null}
        {tab === "history" ? (
          <RevisionHistory
            projectId={projectId}
            pending={busy}
            onRestore={(id) => void perform(() => restore(id))}
          />
        ) : null}
      </TabPanel>
      {checkpoints === undefined ? null : (
        <TabPanel idPrefix="project" id="checkpoints" active={tab === "checkpoints"}>
          {checkpoints}
        </TabPanel>
      )}
      <Drawer
        open={preview !== undefined}
        title="Review affected rebuild"
        onClose={() => {
          if (pending) return;
          setPreview(undefined);
          startMemory.current = undefined;
        }}
      >
        {preview === undefined ? null : (
          <RebuildReview
            key={preview.id}
            preview={preview}
            feedback={<RevisionFeedback error={error} refusal={refusal} />}
            pending={pending}
            onStart={(consent) => void perform(() => start(consent))}
            onCancel={() => {
              setPreview(undefined);
              startMemory.current = undefined;
            }}
          />
        )}
      </Drawer>
    </section>
  );
}
