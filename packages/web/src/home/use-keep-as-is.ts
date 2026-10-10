import type { ProjectListing } from "@app/slices/admission/model.js";
import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/app-context";
import { useToast } from "@/components/kit/toast";
import { keys } from "@/queries";
import { setAside } from "./api.js";

// "Keep as is": held work the person does not want run (a step added after the project was
// made, whose run would redraw what is finished) leaves Needs you until the next edit.
export function useKeepAsIs(
  project: ProjectListing,
): UseMutationResult<{ readonly setAside: boolean }, Error, boolean> {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const keep = useMutation({
    mutationFn: (aside: boolean) => setAside(api, project.id, aside),
    onSuccess: (_, aside) => {
      notify(
        aside
          ? `Kept as is: ${project.title}. It is off Needs you; editing the project brings it back.`
          : `${project.title} is back on Needs you.`,
        "success",
        aside ? { label: "Undo", run: () => keep.mutate(false) } : undefined,
      );
    },
    onError: (error: Error) => {
      notify(
        `${project.title} wasn't kept as is: ${error.message} Press Keep as is again.`,
        "error",
      );
    },
    onSettled: () => client.invalidateQueries({ queryKey: keys.projects }),
  });
  return keep;
}
