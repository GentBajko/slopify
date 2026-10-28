import type { RebuildPreview, RebuildSelection } from "@app/slices/rebuild/model.js";
import type { RevisionEdit, RevisionView } from "@app/slices/revisions/model.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { readProject } from "@/api";
import { useApp } from "@/app-context";
import { copyText } from "@/fixes/fix-actions";
import { keys } from "@/queries";
import { describeEdit, reapplyEdit } from "./draft-merge.js";
import { type ButtonConsent, startsWithoutReview } from "./rebuild-consent.js";
import type { RebuildConsent } from "./rebuild-review.js";
import {
  prepareRevision,
  previewProjectRebuild,
  type RevisionRefusal,
  restoreProjectRevision,
  saveProjectRevision,
  startProjectRebuild,
  viewOf,
} from "./revision-api.js";
import type {
  DraftNotice,
  EditSection,
  RegenerateOptions,
  RevisionController,
} from "./revision-controller-types.js";
import { type RequestMemory, requestFor } from "./revision-requests.js";
import { useDurableDraft } from "./use-durable-draft.js";

export type {
  DraftNotice,
  EditSection,
  RevisionController,
} from "./revision-controller-types.js";

const fresh = (view: RevisionView): RevisionEdit => ({
  config: structuredClone(view.revision.config),
  content: structuredClone(view.revision.content),
});

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
  const [notice, setNotice] = useState<DraftNotice | undefined>();
  const [discarded, setDiscarded] = useState<
    { readonly view: RevisionView; readonly edit: RevisionEdit } | undefined
  >();
  const saveMemory = useRef<RequestMemory | undefined>(undefined);
  const restoreMemory = useRef<RequestMemory | undefined>(undefined);
  const startMemory = useRef<RequestMemory | undefined>(undefined);
  // A make-again saved a version before its preview asked for a look: closing that preview
  // without starting puts back the version from before the press.
  const putBack = useRef<{ readonly previewId: string; readonly revisionId: string } | undefined>(
    undefined,
  );
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
  const durable = useDurableDraft(projectId, view, edit, unsaved);
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
    if (openEditor) setEdit(fresh(result.value.view));
    return result.value.view;
  }
  // An unsaved edit kept from an earlier visit (or before a reload) comes back on the
  // revision it was edited from, so a newer revision shows as a conflict, not as overwritten.
  async function restoreStored(): Promise<boolean> {
    const stored = durable.take();
    if (stored === undefined) return false;
    const base = await viewOf(api, projectId, stored.base);
    const shown = base.ok ? base.value.view : await prepare(false);
    if (shown === undefined) return false;
    setView(shown);
    setEdit(stored.value);
    setNotice({ kind: "restored", savedAt: stored.savedAt });
    openEdit.current?.();
    return true;
  }
  useEffect(() => {
    if (currentRevisionId === null || active.current || !durable.waiting()) return;
    void perform(async () => {
      await restoreStored();
    });
  });
  // False when the project changed again meanwhile: the draft is kept and nothing more runs.
  async function accepted(next: RevisionView): Promise<boolean> {
    const latest = await readProject(api, projectId);
    client.setQueryData(keys.project(projectId), latest);
    await client.invalidateQueries({ queryKey: keys.revisions(projectId) });
    if (!next.current || latest.revisionId !== next.revision.id) {
      setRefusal({
        ok: false,
        reason: "conflict",
        message:
          "The project changed again while saving. Your edit is kept: press Reload latest and re-apply my edit, check it, then Save changes.",
        currentRevisionId: latest.revisionId,
        fields: [],
      });
      return false;
    }
    durable.clear();
    setView(next);
    setEdit(undefined);
    setRefusal(undefined);
    setPreview(undefined);
    setNotice(undefined);
    return true;
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
    if (await accepted(result.value.view)) setNotice({ kind: "saved" });
    saveMemory.current = undefined;
  }
  // The refusal when the rebuild did not start, else undefined.
  async function start(
    consent: RebuildConsent,
    shown = preview,
  ): Promise<RevisionRefusal | undefined> {
    if (shown === undefined) return undefined;
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
      return result;
    }
    startMemory.current = undefined;
    putBack.current = undefined;
    setPreview(undefined);
    await client.invalidateQueries({ queryKey: keys.project(projectId) });
    return undefined;
  }
  // `consent` is what the button that asked accepted; without it the review always opens.
  // `before` is the version a make-again saved over, put back if its review is closed.
  async function review(
    selection: RebuildSelection,
    consent: ButtonConsent | undefined,
    before?: string,
  ): Promise<void> {
    const current = await prepare(false);
    if (current === undefined) return;
    const result = await previewProjectRebuild(api, projectId, {
      baseRevisionId: current.revision.id,
      request: selection,
    });
    if (!result.ok) {
      // A make-again whose work could not even be previewed is put back as well.
      if (before !== undefined) await restore(before, current);
      setRefusal(result);
      return;
    }
    const shown = result.value.value;
    startMemory.current = undefined;
    if (consent !== undefined && startsWithoutReview(shown, consent)) {
      const refused = await start(
        {
          acknowledgeUnknownCosts: consent.unknownPrices === true && shown.costs.unknown > 0,
          confirmedProvidedWorkKeys: [],
        },
        shown,
      );
      // A make-again that could not start (a service not set up, say) leaves nothing half
      // done: the version saved for it goes, and why it could not start stays said.
      if (refused !== undefined && before !== undefined) {
        await restore(before, current);
        setRefusal(refused);
      }
      return;
    }
    putBack.current =
      before === undefined ? undefined : { previewId: shown.id, revisionId: before };
    setPreview(shown);
  }
  // Makes the marked work again now: a version saved with the marks, then only that work.
  async function regenerate(
    workKeys: readonly string[],
    options: RegenerateOptions,
  ): Promise<void> {
    const marked = (draft: RevisionEdit): RevisionEdit => {
      const changed = options.change?.(draft) ?? draft;
      return {
        ...changed,
        regenerate: [...new Set([...(changed.regenerate ?? []), ...workKeys])],
      };
    };
    if (edit !== undefined && unsaved) {
      setEdit(marked(edit));
      setFocus({ section: options.section ?? "images" });
      openEdit.current?.();
      return;
    }
    const base = await prepare(false);
    if (base === undefined) return;
    const result = await saveProjectRevision(api, projectId, {
      baseRevisionId: base.revision.id,
      edit: marked(fresh(base)),
      idempotencyKey: crypto.randomUUID(),
    });
    if (!result.ok) {
      setRefusal(result);
      return;
    }
    const saved = result.value.view;
    if (!(await accepted(saved))) return;
    const starts = options.starts;
    const work =
      starts === undefined
        ? workKeys
        : [
            ...new Set(
              [
                ...saved.pieces
                  .filter((row) => row.selected)
                  .map((row) => ({ key: row.key, outdated: false })),
                ...saved.outputs
                  .filter((row) => row.selected)
                  .map((row) => ({
                    key: row.workKey,
                    role: row.output.role,
                    outdated: row.state === "outdated",
                  })),
              ]
                .filter((one) => starts(one))
                .map((one) => one.key),
            ),
          ];
    await review(
      work.length === 0 ? { kind: "allAffected" } : { kind: "selected", workKeys: work },
      work.length === 0 ? undefined : options,
      base.revision.id,
    );
  }
  // `head` is the version restored over, when the caller has just read it.
  async function restore(targetRevisionId: string, head?: RevisionView): Promise<void> {
    const current = head ?? view ?? saved.data ?? (await prepare(false));
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
    notice,
    busy: pending || uploading || edit !== undefined || preview !== undefined,
    setEdit: (next) => {
      setEdit(next);
      if (notice?.kind !== "restored" && notice?.kind !== "reapplied") setNotice(undefined);
    },
    setUploading,
    openEditor: () =>
      void perform(async () => {
        // Opening again right after a save keeps saying it was saved.
        setNotice((current) => (current?.kind === "saved" ? current : undefined));
        setDiscarded(undefined);
        if (await restoreStored()) return;
        await prepare(true);
      }),
    discard: () => {
      if (view !== undefined && edit !== undefined && unsaved) {
        setDiscarded({ view, edit });
        setNotice({ kind: "discarded" });
      } else setNotice(undefined);
      durable.clear();
      setEdit(undefined);
      setRefusal(undefined);
      setUploading(false);
      saveMemory.current = undefined;
    },
    undoDiscard: () => {
      if (discarded === undefined || edit !== undefined) return;
      setView(discarded.view);
      setEdit(discarded.edit);
      setDiscarded(undefined);
      setNotice(undefined);
      openEdit.current?.();
    },
    dismissNotice: () => {
      setNotice(undefined);
      setDiscarded(undefined);
    },
    save: () => void perform(save),
    reapply: () =>
      void perform(async () => {
        if (edit === undefined || view === undefined) return;
        const mine = edit;
        const base = view;
        saveMemory.current = undefined;
        const latest = await prepare(false);
        if (latest === undefined) return;
        setEdit(reapplyEdit(base.revision, mine, latest.revision));
        setNotice({ kind: "reapplied" });
      }),
    copyEdit: () => {
      if (edit === undefined || view === undefined) return;
      void copyText(describeEdit(view.revision, edit)).then((ok) =>
        setNotice({ kind: "copied", ok }),
      );
    },
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
          if (await restoreStored()) {
            setFocus({ section: request.section });
            return;
          }
          base = await prepare(false);
          if (base === undefined) return;
          draft = fresh(base);
        }
        setEdit(request.change(draft, base));
        setFocus({ section: request.section });
        openEdit.current?.();
      }),
    regenerateNow: (workKeys, options) => void perform(() => regenerate(workKeys, options ?? {})),
    review: (selection, reviewOptions) =>
      void perform(() =>
        review(
          selection,
          reviewOptions?.autoStart === true
            ? {
                approvedUpTo: reviewOptions.approvedUpTo,
                unknownPrices: reviewOptions.unknownPrices,
              }
            : undefined,
        ),
      ),
    start: (consent) =>
      void perform(async () => {
        await start(consent);
      }),
    closePreview: () => {
      if (pending) return;
      const back = putBack.current;
      putBack.current = undefined;
      setPreview(undefined);
      startMemory.current = undefined;
      // Keep things as they are after a make-again: the version saved for it goes, and the
      // project is as it was before the press, its next action and files included.
      if (back !== undefined && back.previewId === preview?.id)
        void perform(() => restore(back.revisionId));
    },
    restore: (id) => void perform(() => restore(id)),
  };
}
