import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { ProjectBody } from "@/api";
import { eventsUrl } from "@/api";
import { useApp } from "@/app-context";
import { subscribeProject } from "@/events";
import { keys } from "@/queries";
import { coalesce, patchProject } from "./live.js";
import { appendWriting, type WritingPreview, writingKey } from "./live-writing.js";

// How long a burst of events is folded into one refetch. Short enough that an image
// appears while the eye is still on the grid, long enough that a stage landing sixty of
// them costs two requests rather than sixty.
const burstMs = 200;

// The project page's subscription: patch what the frame carries, ask for what it cannot,
// and refetch outright when the browser reconnects.
export function useLiveProject(projectId: string): void {
  const { api, openEvents } = useApp();
  const queryClient = useQueryClient();

  useEffect(() => {
    const refetch = coalesce(() => {
      void queryClient.invalidateQueries({ queryKey: keys.project(projectId) });
      void queryClient.invalidateQueries({ queryKey: keys.projects });
    }, burstMs);

    const unsubscribe = subscribeProject(openEvents, eventsUrl(api, `projects/${projectId}`), {
      refetch: refetch.ask,
      previewWriting: (event) => {
        queryClient.setQueryData<readonly WritingPreview[]>(writingKey(projectId), (seen) =>
          appendWriting(seen ?? [], event),
        );
      },
      appendArticle: (text) => {
        queryClient.setQueryData<string>(keys.article(projectId), (seen) => `${seen ?? ""}${text}`);
      },
      patch: (event) => {
        if (event.type === "stage.state" && event.state === "running") {
          queryClient.setQueryData<readonly WritingPreview[]>(writingKey(projectId), (seen) =>
            (seen ?? []).filter((one) => one.stage !== event.stage),
          );
          if (event.stage === "article") queryClient.setQueryData(keys.article(projectId), "");
        }
        queryClient.setQueryData<ProjectBody>(keys.project(projectId), (seen) =>
          patchProject(seen, event),
        );
      },
    });

    return () => {
      unsubscribe();
      refetch.stop();
    };
  }, [api, openEvents, queryClient, projectId]);
}
