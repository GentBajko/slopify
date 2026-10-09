import type { ProjectState } from "@app/kernel/pipeline.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { deleteOldVersions, keepOutputsOnly, readProjectStorage } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { ConfirmDialog } from "@/components/kit/dialog";
import { SectionHead } from "@/components/kit/section-head";
import { useToast } from "@/components/kit/toast";
import { keys } from "@/queries";
import {
  formatBytes,
  keepOutputsConsequence,
  oldVersionsConsequence,
} from "@/routes/settings-storage";

// Storage that looks after itself: a finished project offers to drop the working files it was
// made from and keep its outputs, saying how much space that frees (`slices/storage/trim.ts`,
// the same Keep outputs only as Settings → Storage). Not offered on the bundled samples, nor
// while anything of the project runs or waits.

export const projectStorageKey = (projectId: string) => ["storage", "project", projectId] as const;

export function FreeSpaceOffer({
  projectId,
  title,
  status,
  sample,
}: {
  readonly projectId: string;
  readonly title: string;
  readonly status: ProjectState;
  readonly sample: boolean;
}): ReactElement | null {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const [asking, setAsking] = useState(false);
  const [askingOld, setAskingOld] = useState(false);
  const done = status === "done" || status === "partial";
  const storage = useQuery({
    // Asked again when the project's state changes: a remake needs its working files back.
    queryKey: [...projectStorageKey(projectId), status],
    queryFn: () => readProjectStorage(api, projectId),
    enabled: done && !sample,
  });
  const trim = useMutation({
    mutationFn: () => keepOutputsOnly(api, projectId),
    onSuccess: (result) =>
      notify(
        result.files === 0
          ? `"${title}" had no working files left to remove.`
          : `Freed ${formatBytes(result.bytesFreed)} from "${title}". The outputs are all still here.`,
        "success",
      ),
    onError: (error: Error) =>
      notify(`The working files of "${title}" weren't removed: ${error.message}`, "error"),
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: projectStorageKey(projectId) }),
        client.invalidateQueries({ queryKey: ["storage-usage"] }),
        client.invalidateQueries({ queryKey: keys.project(projectId) }),
      ]);
    },
  });
  const old = useMutation({
    mutationFn: () => deleteOldVersions(api, projectId),
    onSuccess: (result) =>
      notify(
        result.files === 0
          ? `"${title}" had no old versions left to delete.`
          : `Freed ${formatBytes(result.bytesFreed)} from "${title}". The current version is all still here.`,
        "success",
      ),
    onError: (error: Error) =>
      notify(`The old versions of "${title}" weren't deleted: ${error.message}`, "error"),
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: projectStorageKey(projectId) }),
        client.invalidateQueries({ queryKey: ["storage-usage"] }),
        client.invalidateQueries({ queryKey: keys.project(projectId) }),
      ]);
    },
  });
  const data = storage.data;
  if (
    !done ||
    sample ||
    data === undefined ||
    !data.finished ||
    (data.removableBytes === 0 && data.historyBytes === 0)
  )
    return null;
  const freed = formatBytes(data.removableBytes);
  const history = formatBytes(data.historyBytes);
  return (
    <section aria-label="Free space" className="flex flex-col gap-2">
      <SectionHead
        as="h3"
        title="Free space"
        meta={`Outputs ${formatBytes(data.outputsBytes)} · working files ${formatBytes(data.workingBytes)}${data.historyBytes > 0 ? ` · old versions ${history}` : ""}`}
        info="project.free-space"
      >
        {/* The rail is narrow: the button says what it frees, the dialog says the rest. */}
        {data.removableBytes > 0 ? (
          <Button
            variant="secondary"
            size="small"
            aria-label={`Free ${freed}: keep the outputs, drop the working files`}
            disabled={trim.isPending}
            disabledReason="Removing the working files…"
            onClick={() => setAsking(true)}
          >
            {trim.isPending ? "Removing…" : `Free ${freed}`}
          </Button>
        ) : null}
      </SectionHead>
      {data.historyBytes > 0 ? (
        <Button
          variant="quiet"
          size="small"
          className="self-start"
          disabled={old.isPending}
          disabledReason="Deleting the old versions…"
          onClick={() => setAskingOld(true)}
        >
          {old.isPending ? "Deleting…" : `Delete old versions (${history})`}
        </Button>
      ) : null}
      <ConfirmDialog
        open={askingOld}
        title={`Delete the old versions of "${title}"?`}
        consequence={oldVersionsConsequence(data.historyFiles, data.historyBytes)}
        confirmLabel={`Free ${history}`}
        cancelLabel="Keep the old versions"
        pending={old.isPending}
        onConfirm={() => {
          setAskingOld(false);
          old.mutate();
        }}
        onCancel={() => setAskingOld(false)}
      />
      <ConfirmDialog
        open={asking}
        title={`Free ${freed} from "${title}"?`}
        consequence={keepOutputsConsequence(data.removableFiles, data.removableBytes)}
        confirmLabel={`Free ${freed}`}
        cancelLabel="Keep the working files"
        pending={trim.isPending}
        onConfirm={() => {
          setAsking(false);
          trim.mutate();
        }}
        onCancel={() => setAsking(false)}
      />
    </section>
  );
}
