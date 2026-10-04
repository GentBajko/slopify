import type { ProjectListing } from "@app/slices/admission/model.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/app-context";
import { useToast } from "@/components/kit/toast";
import { keys } from "@/queries";
import { markUploaded } from "./api.js";

// Mark uploaded (and Mark not uploaded) for several projects at once, shared by the Projects
// list's selection bar and Home's Ready to upload rows: each project on its own, so one
// refusal leaves the rest done, announced in one toast with Undo.

export interface Each {
  readonly done: readonly ProjectListing[];
  readonly failed: readonly { readonly project: ProjectListing; readonly reason: string }[];
}

export async function eachOf(
  projects: readonly ProjectListing[],
  run: (project: ProjectListing) => Promise<unknown>,
): Promise<Each> {
  const done: ProjectListing[] = [];
  const failed: { project: ProjectListing; reason: string }[] = [];
  for (const project of projects) {
    try {
      await run(project);
      done.push(project);
    } catch (error) {
      failed.push({ project, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { done, failed };
}

export function videosWord(count: number, noun: readonly [string, string]): string {
  return `${String(count)} ${count === 1 ? noun[0] : noun[1]}`;
}

export function useBulkMarkUploaded({
  noun,
  offWords,
  onSettled,
}: {
  // ["project", "projects"] on Projects, ["video", "videos"] on Home.
  readonly noun: readonly [string, string];
  // Where a marked video goes off, said after "Marked 2 videos uploaded.".
  readonly offWords?: (count: number) => string;
  readonly onSettled?: () => void;
}) {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const mark = useMutation({
    mutationFn: (input: { readonly list: readonly ProjectListing[]; readonly on: boolean }) =>
      eachOf(input.list, (one) => markUploaded(api, one.id, input.on)),
    onSuccess: ({ done, failed }, input) => {
      if (done.length > 0)
        notify(
          input.on
            ? `Marked ${videosWord(done.length, noun)} uploaded.${offWords === undefined ? "" : ` ${offWords(done.length)}`}`
            : `${videosWord(done.length, noun)} back on Ready to upload.`,
          "success",
          { label: "Undo", run: () => mark.mutate({ list: done, on: !input.on }) },
        );
      const first = failed[0];
      if (first !== undefined)
        notify(
          `${videosWord(failed.length, noun)} ${failed.length === 1 ? "wasn't" : "weren't"} ${input.on ? "marked uploaded" : "marked not uploaded"}: "${first.project.title}": ${first.reason} Press the button again.`,
          "error",
        );
    },
    onError: (error: Error) =>
      notify(`Nothing was marked: ${error.message} Press the button again.`, "error"),
    onSettled: async () => {
      onSettled?.();
      await client.invalidateQueries({ queryKey: keys.projects });
    },
  });
  return mark;
}
