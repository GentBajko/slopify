import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  cleanUpStorage,
  deleteAllOldVersions,
  deleteOldVersions,
  keepOutputsOnly,
  type StorageUsage,
} from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { ConfirmDialog } from "@/components/kit/dialog";
import { InfoTip } from "@/components/kit/info-tip";
import { List, ListRow } from "@/components/kit/list-row";
import { useToast } from "@/components/kit/toast";
import { fileSize } from "@/lib/format";

type ProjectUsage = StorageUsage["byProject"][number];

// Storage by project: what each one keeps for publishing (outputs), what it was made from
// (working files) and its older versions (History), with Delete old versions and Keep outputs
// only per project, and both for every project at once. Largest first, since that is where
// space comes back.
type Asking =
  | { readonly kind: "old"; readonly project: ProjectUsage }
  | { readonly kind: "trim"; readonly project: ProjectUsage }
  | { readonly kind: "all-old" }
  | { readonly kind: "cleanup" };

export function ProjectStorageList({
  projects,
  queryKey,
}: {
  readonly projects: readonly ProjectUsage[];
  readonly queryKey: readonly unknown[];
}) {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const notify = useToast();
  const [asking, setAsking] = useState<Asking | undefined>();
  const [error, setError] = useState<string | undefined>();
  const freed = (files: number, bytes: number, what: string, where: string) =>
    files === 0
      ? `Nothing left to remove ${where}.`
      : `Freed ${formatBytes(bytes)} ${where} (${String(files)} ${what}${files === 1 ? "" : "s"}).`;
  const run = useMutation({
    mutationFn: async (action: Asking) => {
      switch (action.kind) {
        case "old":
          return {
            ...(await deleteOldVersions(api, action.project.id)),
            skipped: 0,
          };
        case "trim":
          return { ...(await keepOutputsOnly(api, action.project.id)), skipped: 0 };
        case "all-old": {
          const result = await deleteAllOldVersions(api);
          return { ...result, skipped: result.busy };
        }
        case "cleanup":
          return cleanUpStorage(api);
      }
    },
    onMutate: () => setError(undefined),
    onSuccess: (result, action) => {
      const where =
        action.kind === "old" || action.kind === "trim"
          ? `from "${action.project.title}"`
          : "across your projects";
      const what = action.kind === "trim" ? "working file" : "file";
      const skipped =
        result.skipped === 0
          ? ""
          : ` ${String(result.skipped)} project${result.skipped === 1 ? " was" : "s were"} running or not finished and kept everything.`;
      notify(`${freed(result.files, result.bytesFreed, what, where)}${skipped}`, "success");
    },
    onError: (caught: Error) => setError(caught.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
  const sorted = projects.toSorted((a, b) => b.bytes - a.bytes);
  const history = projects.reduce((sum, one) => sum + one.historyBytes, 0);
  const historyFiles = projects.reduce((sum, one) => sum + one.historyFiles, 0);
  const working = projects.reduce((sum, one) => sum + (one.finished ? one.removableBytes : 0), 0);
  const workingFiles = projects.reduce(
    (sum, one) => sum + (one.finished ? one.removableFiles : 0),
    0,
  );
  const busy = run.isPending;
  const pendingOn = (kind: Asking["kind"], id?: string) =>
    busy &&
    run.variables?.kind === kind &&
    (id === undefined || ("project" in run.variables && run.variables.project.id === id));
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="small"
          disabled={history === 0 || busy}
          disabledReason={history === 0 ? "No older versions to delete." : "Working…"}
          onClick={() => setAsking({ kind: "all-old" })}
        >
          {pendingOn("all-old") ? "Deleting…" : `Delete all old versions (${formatBytes(history)})`}
        </Button>
        <Button
          variant="secondary"
          size="small"
          disabled={history + working === 0 || busy}
          disabledReason={history + working === 0 ? "Nothing to clean up." : "Working…"}
          onClick={() => setAsking({ kind: "cleanup" })}
        >
          {pendingOn("cleanup")
            ? "Cleaning up…"
            : `Clean up everything (${formatBytes(history + working)})`}
        </Button>
        <InfoTip id="settings.storage.keep-outputs" />
      </div>
      <List label="Storage by project">
        {sorted.map((project) => (
          <ListRow
            key={project.id}
            title={project.title}
            meta={
              <span className="tabular-nums">
                {formatBytes(project.bytes)} · outputs {formatBytes(project.outputsBytes)} · working
                files {formatBytes(project.workingBytes)}
                {project.historyBytes > 0
                  ? ` · old versions ${formatBytes(project.historyBytes)}`
                  : ""}
              </span>
            }
            actions={
              <>
                {project.historyBytes > 0 ? (
                  <Button
                    variant="quiet"
                    size="small"
                    disabled={busy}
                    title={`Frees ${formatBytes(project.historyBytes)}.`}
                    onClick={() => setAsking({ kind: "old", project })}
                  >
                    {pendingOn("old", project.id) ? "Deleting…" : "Delete old versions"}
                  </Button>
                ) : null}
                <Button
                  variant="quiet"
                  size="small"
                  disabled={!project.finished || project.removableBytes === 0 || busy}
                  title={
                    !project.finished
                      ? "Available once the project has finished."
                      : project.removableBytes === 0
                        ? "No working files left to remove."
                        : `Frees ${formatBytes(project.removableBytes)}.`
                  }
                  onClick={() => setAsking({ kind: "trim", project })}
                >
                  {pendingOn("trim", project.id) ? "Removing…" : "Keep outputs only"}
                </Button>
              </>
            }
          />
        ))}
      </List>
      {error === undefined ? null : (
        <p role="alert" className="m-0 mt-2 text-small text-danger">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={asking !== undefined}
        title={
          asking?.kind === "old"
            ? `Delete the old versions of "${asking.project.title}"?`
            : asking?.kind === "trim"
              ? `Keep only the outputs of "${asking.project.title}"?`
              : asking?.kind === "all-old"
                ? "Delete every project's old versions?"
                : "Clean up every project?"
        }
        consequence={
          asking?.kind === "old"
            ? oldVersionsConsequence(asking.project.historyFiles, asking.project.historyBytes)
            : asking?.kind === "trim"
              ? keepOutputsConsequence(asking.project.removableFiles, asking.project.removableBytes)
              : asking?.kind === "all-old"
                ? oldVersionsConsequence(historyFiles, history)
                : `${oldVersionsConsequence(historyFiles, history)} ${keepOutputsConsequence(workingFiles, working)} Projects that are running or not finished keep everything.`
        }
        confirmLabel={
          asking?.kind === "trim"
            ? "Keep outputs only"
            : asking?.kind === "cleanup"
              ? "Clean up everything"
              : "Delete old versions"
        }
        cancelLabel="Keep everything"
        pending={busy}
        onConfirm={() => {
          const action = asking;
          setAsking(undefined);
          if (action !== undefined) run.mutate(action);
        }}
        onCancel={() => setAsking(undefined)}
      />
    </>
  );
}

// What Delete old versions removes and what it costs later.
export function oldVersionsConsequence(files: number, bytes: number): string {
  return `This deletes ${String(files)} file(s) of older versions and frees ${formatBytes(bytes)}: what is in the projects' History folders (earlier renders, narration before a change). The current video, shorts, thumbnails and everything in Upload stay, and so does anything you uploaded or put there yourself. Going back to one of those older versions makes its files again, which takes time and uses provider credits.`;
}

// What Keep outputs only removes and what it costs later, asked before it runs here and on
// the project page.
export function keepOutputsConsequence(files: number, bytes: number): string {
  return `This removes ${String(files)} working file(s) and frees ${formatBytes(bytes)}: the images, narration parts, subtitle timing and render settings the project was made from. The video, shorts, thumbnail, article, description and document stay, and so does anything you uploaded. If you change this project later (edit an image, a caption style or the narration, or re-render), Slopify has to make those files again first, which takes time and uses provider credits.`;
}

export const formatBytes = fileSize;
