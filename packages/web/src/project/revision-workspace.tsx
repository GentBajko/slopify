import type { RebuildPreview } from "@app/slices/rebuild/model.js";
import type { RevisionEdit, RevisionView } from "@app/slices/revisions/model.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useRef, useState } from "react";
import { readProject } from "@/api";
import { useApp } from "@/app-context";
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
export interface EditorProps {
  readonly view: RevisionView;
  readonly edit: RevisionEdit;
  readonly fields: readonly { readonly field: string; readonly message: string }[];
  readonly onChange: (edit: RevisionEdit) => void;
  readonly onPending: (pending: boolean) => void;
}
export function RevisionWorkspace({
  projectId,
  currentRevisionId,
  renderEditor,
}: {
  readonly projectId: string;
  readonly currentRevisionId: string | null;
  readonly renderEditor: (props: EditorProps) => ReactNode;
}): import("react").ReactElement {
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
  const [history, setHistory] = useState(false);
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
  return (
    <section aria-label="Project revisions" className="space-y-4">
      {saved.error === null ? null : <p role="alert">{saved.error.message}</p>}
      {saved.data === undefined ? null : (
        <ul
          aria-label="Saved output status"
          className="flex flex-wrap gap-x-4 gap-y-1 text-small text-ink2"
        >
          {saved.data.outputs
            .filter((output) => output.selected)
            .map((output) => (
              <li key={output.recordId}>
                {outputLabel(output.output)}:{" "}
                {output.available
                  ? output.state === "ready"
                    ? "Ready"
                    : output.state === "outdated"
                      ? "Needs rebuild; retained output available"
                      : "Provided content needs review"
                  : "Retained file missing"}
              </li>
            ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={pending || uploading || edit !== undefined || preview !== undefined}
          onClick={() =>
            void perform(async () => {
              await prepare(true);
            })
          }
        >
          Edit project
        </Button>
        <Button type="button" onClick={() => setHistory(!history)}>
          History
        </Button>
        <Button
          type="button"
          disabled={pending || uploading || edit !== undefined || preview !== undefined}
          onClick={() => void perform(review)}
        >
          Rebuild affected outputs
        </Button>
      </div>
      <p className="text-small text-ink2">
        Resume uses the current saved revision. Rebuild affected outputs opens optional Advanced
        rebuild review for selection, cost details and supplied-content confirmation.
      </p>
      {preview === undefined ? <RevisionFeedback error={error} refusal={refusal} /> : null}
      {edit === undefined && refusal?.reason === "conflict" ? (
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
      ) : null}
      {remoteChanged ? (
        <p role="status">A newer revision is available. Your unsaved changes are kept below.</p>
      ) : null}
      {view === undefined || edit === undefined ? null : (
        <form
          className="space-y-4 rounded-panel border border-line bg-panel p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void perform(save);
          }}
        >
          <fieldset disabled={pending}>
            {renderEditor({
              view,
              edit,
              fields: refusal?.fields ?? [],
              onChange: setEdit,
              onPending: setUploading,
            })}
          </fieldset>
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" type="submit" disabled={pending || uploading}>
              Save changes
            </Button>
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
          </div>
        </form>
      )}
      {history ? (
        <RevisionHistory
          projectId={projectId}
          pending={pending || uploading || edit !== undefined || preview !== undefined}
          onRestore={(id) => void perform(() => restore(id))}
        />
      ) : null}
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
    </section>
  );
}
