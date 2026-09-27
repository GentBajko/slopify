import type { RebuildPreview, RebuildSelection } from "@app/slices/rebuild/model.js";
import type { RevisionEdit, RevisionView } from "@app/slices/revisions/model.js";
import { type UseQueryResult, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, type ReactNode, useMemo, useRef, useState } from "react";
import { readProject } from "@/api";
import { useApp } from "@/app-context";
import { ActionBar, StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { Drawer } from "@/components/kit/drawer";
import { InfoTip } from "@/components/kit/info-tip";
import { SectionHead } from "@/components/kit/section-head";
import { type TabItem, TabPanel, Tabs } from "@/components/kit/tabs";
import { keys } from "@/queries";
import { outputLabel } from "./output-label.js";
import { type RebuildConsent, RebuildReview } from "./rebuild-review.js";
import { type EditRequest, EditRequestContext } from "./revision-action-context.js";
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
  | "reviews"
  | "shorts"
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
  // The section a change asked for from the project page opens; a new object each time.
  readonly focus?: { readonly section: EditSection } | undefined;
}

export type ProjectTab = "output" | "live" | "edit" | "history" | "checkpoints" | "cost";

// Everything the project's saved revisions do: the settings draft and its save, the history
// and its restore, and rebuilds (the one-press remake of outdated outputs as well as the full
// rebuild review). One hook, so the project page's next action, its settings view and its
// history all act on the same draft and the same preview.
export interface RevisionController {
  readonly saved: UseQueryResult<RevisionView>;
  readonly view: RevisionView | undefined;
  readonly edit: RevisionEdit | undefined;
  readonly preview: RebuildPreview | undefined;
  readonly focus: { readonly section: EditSection } | undefined;
  readonly pending: boolean;
  readonly uploading: boolean;
  readonly error: string | undefined;
  readonly refusal: RevisionRefusal | undefined;
  readonly unsaved: boolean;
  readonly remoteChanged: boolean;
  // Something is open or on its way: a draft, a preview, a request.
  readonly busy: boolean;
  readonly setEdit: (edit: RevisionEdit) => void;
  readonly setUploading: (pending: boolean) => void;
  readonly openEditor: () => void;
  readonly discard: () => void;
  readonly save: () => void;
  readonly reloadDraft: () => void;
  readonly reloadCurrent: () => void;
  readonly requestEdit: (request: EditRequest) => void;
  // Previews a rebuild. With `autoStart`, a preview that needs no consent (nothing blocked,
  // no provided content to confirm, no unknown cost) starts at once; otherwise the review
  // drawer opens so the person can see why.
  readonly review: (
    selection: RebuildSelection,
    options?: { readonly autoStart?: boolean },
  ) => void;
  readonly start: (consent: RebuildConsent) => void;
  readonly closePreview: () => void;
  readonly restore: (targetRevisionId: string) => void;
}

export function useRevisionController(
  projectId: string,
  currentRevisionId: string | null,
  options: {
    // Called when a change asked for from the page opens the settings draft.
    readonly onOpenEdit?: () => void;
  } = {},
): RevisionController {
  const { api } = useApp();
  const client = useQueryClient();
  const saved = useQuery({
    queryKey: keys.revision(projectId, currentRevisionId ?? ""),
    enabled: currentRevisionId !== null,
    queryFn: async () => {
      if (currentRevisionId === null)
        throw new Error(
          "This project has no saved settings to show yet. Reload the page and try again.",
        );
      const result = await viewOf(api, projectId, currentRevisionId);
      if (!result.ok) throw new Error(result.message);
      return result.value.view;
    },
  });
  const [view, setView] = useState<RevisionView | undefined>();
  const [edit, setEdit] = useState<RevisionEdit | undefined>();
  const [preview, setPreview] = useState<RebuildPreview | undefined>();
  const [focus, setFocus] = useState<{ readonly section: EditSection } | undefined>();
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [refusal, setRefusal] = useState<RevisionRefusal | undefined>();
  const saveMemory = useRef<RequestMemory | undefined>(undefined);
  const restoreMemory = useRef<RequestMemory | undefined>(undefined);
  const startMemory = useRef<RequestMemory | undefined>(undefined);
  const openEdit = useRef(options.onOpenEdit);
  openEdit.current = options.onOpenEdit;
  // Open is not the same as changed: the editor starts from a copy of the saved revision, so
  // the view only says "unsaved" once something differs from it or a remake or upload is queued.
  const unsaved = useMemo(
    () =>
      edit !== undefined &&
      (view === undefined ||
        (edit.regenerate?.length ?? 0) > 0 ||
        (edit.uploads?.length ?? 0) > 0 ||
        JSON.stringify(edit.config) !== JSON.stringify(view.revision.config) ||
        JSON.stringify(edit.content) !== JSON.stringify(view.revision.content)),
    [edit, view],
  );
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
  async function start(consent: RebuildConsent, shown = preview): Promise<void> {
    if (shown === undefined) return;
    const payload = { baseRevisionId: shown.baseRevisionId, previewId: shown.id, ...consent };
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
  async function review(selection: RebuildSelection, autoStart: boolean): Promise<void> {
    const current = await prepare(false);
    if (current === undefined) return;
    const result = await previewProjectRebuild(api, projectId, {
      baseRevisionId: current.revision.id,
      request: selection,
    });
    if (!result.ok) {
      setRefusal(result);
      return;
    }
    const shown = result.value.value;
    startMemory.current = undefined;
    if (autoStart && needsNoConsent(shown)) {
      await start({ acknowledgeUnknownCosts: false, confirmedProvidedWorkKeys: [] }, shown);
      return;
    }
    setPreview(shown);
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
  return {
    saved,
    view,
    edit,
    preview,
    focus,
    pending,
    uploading,
    error,
    refusal,
    unsaved,
    remoteChanged,
    busy: pending || uploading || edit !== undefined || preview !== undefined,
    setEdit,
    setUploading,
    openEditor: () =>
      void perform(async () => {
        await prepare(true);
      }),
    discard: () => {
      setEdit(undefined);
      setRefusal(undefined);
      setUploading(false);
      saveMemory.current = undefined;
    },
    save: () => void perform(save),
    reloadDraft: () =>
      void perform(async () => {
        saveMemory.current = undefined;
        setUploading(false);
        await prepare(true);
        setRefusal(undefined);
      }),
    reloadCurrent: () =>
      void perform(async () => {
        restoreMemory.current = undefined;
        startMemory.current = undefined;
        setPreview(undefined);
        await prepare(false);
        await client.invalidateQueries({ queryKey: keys.project(projectId) });
      }),
    requestEdit: (request) =>
      void perform(async () => {
        let base = view;
        let draft = edit;
        if (base === undefined || draft === undefined) {
          base = await prepare(false);
          if (base === undefined) return;
          draft = {
            config: structuredClone(base.revision.config),
            content: structuredClone(base.revision.content),
          };
        }
        setEdit(request.change(draft, base));
        setFocus({ section: request.section });
        openEdit.current?.();
      }),
    review: (selection, reviewOptions) =>
      void perform(() => review(selection, reviewOptions?.autoStart === true)),
    start: (consent) => void perform(() => start(consent)),
    closePreview: () => {
      if (pending) return;
      setPreview(undefined);
      startMemory.current = undefined;
    },
    restore: (id) => void perform(() => restore(id)),
  };
}

// A preview that can start without asking anything: nothing blocked, no provided content
// to confirm and every cost known.
export function needsNoConsent(preview: RebuildPreview): boolean {
  return (
    !preview.work.some((work) => work.disposition === "blocked") &&
    preview.providedReuseRequired.length === 0 &&
    preview.costs.unknown === 0
  );
}

// The project's settings: the draft editor with its Save, or the button that opens it.
export function RevisionEditPanel({
  controller,
  renderEditor,
  active = true,
  intro,
}: {
  readonly controller: RevisionController;
  readonly renderEditor: (props: EditorProps) => ReactNode;
  // Feedback is said only in the view on screen, so one refusal is not announced twice.
  readonly active?: boolean;
  // Shown above the Edit project button while no draft is open.
  readonly intro?: ReactNode;
}): ReactElement {
  const c = controller;
  if (c.view === undefined || c.edit === undefined)
    return (
      <div className="flex flex-col gap-4">
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
                        {output.available
                          ? output.state === "ready"
                            ? "Ready"
                            : output.state === "outdated"
                              ? "Outdated; the retained version stays until it is remade"
                              : "Provided content needs review"
                          : "Retained file missing"}
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
        <ActionBar>
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
  return (
    <form
      aria-label="Edit project"
      onSubmit={(event) => {
        event.preventDefault();
        c.save();
      }}
    >
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
      <ActionBar
        status={
          <StatusSlot tone={c.remoteChanged ? "warning" : "info"}>
            {c.remoteChanged
              ? "A newer revision is available. Your unsaved changes are kept below."
              : c.uploading
                ? "Waiting for uploads to finish…"
                : undefined}
          </StatusSlot>
        }
      >
        {c.remoteChanged || c.refusal?.reason === "conflict" ? (
          <Button disabled={c.pending || c.uploading} onClick={c.reloadDraft}>
            Reload current revision and discard my draft
          </Button>
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

export function RevisionHistoryPanel({
  controller,
  projectId,
  active,
}: {
  readonly controller: RevisionController;
  readonly projectId: string;
  readonly active: boolean;
}): ReactElement | null {
  const c = controller;
  if (!active) return null;
  return (
    <>
      {c.preview === undefined && (c.error || c.refusal) ? (
        <div className="mb-4 flex flex-col gap-3">
          <RevisionFeedback error={c.error} refusal={c.refusal} />
          {c.edit === undefined && c.refusal?.reason === "conflict" ? (
            <Button disabled={c.pending} onClick={c.reloadCurrent} className="self-start">
              Reload current revision
            </Button>
          ) : null}
        </div>
      ) : null}
      <RevisionHistory projectId={projectId} pending={c.busy} onRestore={c.restore} />
    </>
  );
}

// The rebuild review, over whichever view is showing.
export function RebuildDrawer({
  controller,
}: {
  readonly controller: RevisionController;
}): ReactElement | null {
  const c = controller;
  return (
    <Drawer open={c.preview !== undefined} title="Choose what to remake" onClose={c.closePreview}>
      {c.preview === undefined ? null : (
        <RebuildReview
          key={c.preview.id}
          preview={c.preview}
          feedback={<RevisionFeedback error={c.error} refusal={c.refusal} />}
          pending={c.pending}
          onStart={c.start}
          onCancel={c.closePreview}
        />
      )}
    </Drawer>
  );
}

// The saved revisions on their own, as tabs: Edit and History, with the page's other views
// passed in. The project page lays these views out in its own section rail; this keeps them
// usable, and tested, as one piece.
export function RevisionWorkspace({
  projectId,
  currentRevisionId,
  renderEditor,
  tab: controlledTab,
  onTab,
  output,
  live,
  checkpoints,
  checkpointBadge,
  cost,
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
  readonly live?: ReactNode;
  readonly checkpoints?: ReactNode;
  readonly checkpointBadge?: string;
  readonly cost?: ReactNode;
  readonly trailing?: ReactNode;
}): ReactElement {
  const [ownTab, setOwnTab] = useState<ProjectTab>(output === undefined ? "edit" : "output");
  const tab = controlledTab ?? ownTab;
  const selectTab = (next: ProjectTab) => {
    setOwnTab(next);
    onTab?.(next);
  };
  const controller = useRevisionController(projectId, currentRevisionId, {
    onOpenEdit: () => selectTab("edit"),
  });
  const tabs: TabItem<ProjectTab>[] = [
    ...(output === undefined ? [] : [{ id: "output" as const, label: "Output" }]),
    ...(live === undefined ? [] : [{ id: "live" as const, label: "Live" }]),
    {
      id: "edit",
      label: "Edit",
      ...(controller.unsaved ? { badge: "· unsaved" } : {}),
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
    ...(cost === undefined ? [] : [{ id: "cost" as const, label: "Run cost" }]),
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
          <EditRequestContext
            value={
              controller.pending || controller.preview !== undefined
                ? undefined
                : controller.requestEdit
            }
          >
            {output}
          </EditRequestContext>
        </TabPanel>
      )}
      <TabPanel idPrefix="project" id="edit" active={tab === "edit"}>
        <RevisionEditPanel
          controller={controller}
          renderEditor={renderEditor}
          active={tab === "edit"}
        />
      </TabPanel>
      <TabPanel idPrefix="project" id="history" active={tab === "history"}>
        <RevisionHistoryPanel
          controller={controller}
          projectId={projectId}
          active={tab === "history"}
        />
      </TabPanel>
      {live === undefined ? null : (
        <TabPanel idPrefix="project" id="live" active={tab === "live"}>
          {tab === "live" ? live : null}
        </TabPanel>
      )}
      {checkpoints === undefined ? null : (
        <TabPanel idPrefix="project" id="checkpoints" active={tab === "checkpoints"}>
          {checkpoints}
        </TabPanel>
      )}
      {cost === undefined ? null : (
        <TabPanel idPrefix="project" id="cost" active={tab === "cost"}>
          {cost}
        </TabPanel>
      )}
      <RebuildDrawer controller={controller} />
    </section>
  );
}
