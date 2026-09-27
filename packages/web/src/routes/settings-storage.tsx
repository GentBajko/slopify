import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { keepOutputsOnly, type StorageUsage } from "@/api";
import { useApp } from "@/app-context";
import { ConfirmDialog } from "@/components/confirm";
import { useToast } from "@/components/kit/toast";
import { Button } from "@/components/ui/button";

type ProjectUsage = StorageUsage["byProject"][number];

// Storage by project: what each one keeps for publishing (outputs) and what it was made from
// (working files), with Keep outputs only on a finished project. Largest first, since that is
// where space comes back.
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
  const [asking, setAsking] = useState<ProjectUsage | undefined>();
  const [error, setError] = useState<string | undefined>();
  const trim = useMutation({
    mutationFn: (project: ProjectUsage) => keepOutputsOnly(api, project.id),
    onMutate: () => setError(undefined),
    onSuccess: (result, project) => {
      notify(
        result.files === 0
          ? `"${project.title}" had no working files left to remove.`
          : `Freed ${formatBytes(result.bytesFreed)} from "${project.title}" (${String(result.files)} working file${result.files === 1 ? "" : "s"}).`,
        "success",
      );
    },
    onError: (caught: Error) => setError(caught.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
  const sorted = projects.toSorted((a, b) => b.bytes - a.bytes);
  return (
    <>
      <ul aria-label="Storage by project">
        {sorted.map((project) => (
          <li
            key={project.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-2 text-small text-ink2 last:border-b-0"
          >
            <span className="min-w-0 flex-1 truncate text-ink">{project.title}</span>
            <span className="shrink-0 tabular-nums">
              {formatBytes(project.bytes)} · outputs {formatBytes(project.outputsBytes)} · working
              files {formatBytes(project.workingBytes)}
            </span>
            <Button
              type="button"
              variant="ghost"
              disabled={!project.finished || project.removableBytes === 0 || trim.isPending}
              title={
                !project.finished
                  ? "Available once the project has finished."
                  : project.removableBytes === 0
                    ? "No working files left to remove."
                    : `Frees ${formatBytes(project.removableBytes)}.`
              }
              onClick={() => setAsking(project)}
            >
              {trim.isPending && trim.variables?.id === project.id
                ? "Removing…"
                : "Keep outputs only"}
            </Button>
          </li>
        ))}
      </ul>
      {error === undefined ? null : (
        <p role="alert" className="mt-2 px-4 text-small text-red">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={asking !== undefined}
        title={`Keep only the outputs of "${asking?.title ?? ""}"?`}
        consequence={`This removes ${String(asking?.removableFiles ?? 0)} working file(s) and frees ${formatBytes(asking?.removableBytes ?? 0)}: the images, narration parts, subtitle timing and render settings the project was made from. The video, shorts, thumbnail, article, description and document stay, and so does anything you uploaded. If you change this project later (edit an image, a caption style or the narration, or re-render), Slopify has to make those files again first, which takes time and uses provider credits.`}
        verb="Keep outputs only"
        pending={trim.isPending}
        onConfirm={() => {
          const project = asking;
          setAsking(undefined);
          if (project !== undefined) trim.mutate(project);
        }}
        onCancel={() => setAsking(undefined)}
      />
    </>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = units[0] ?? "KB";
  for (const candidate of units) {
    value /= 1024;
    unit = candidate;
    if (value < 1024 || candidate === units.at(-1)) break;
  }
  const rounded = value >= 10 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, "");
  return `${rounded} ${unit}`;
}
