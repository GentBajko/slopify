import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { ProjectBody } from "@/api";
import { eventsUrl } from "@/api";
import { useApp } from "@/app-context";
import { subscribeProject } from "@/events";
import { peaksKey } from "@/onboarding/api";
import { keys } from "@/queries";
import { checkpointKey } from "./checkpoint-api.js";
import { liveRefetch, patchProject } from "./live.js";
import { appendWriting, type WritingPreview, writingKey } from "./live-writing.js";
import { reviewsKey } from "./review-api.js";

// The project page's subscription: patch what the frame carries, ask for what it cannot,
// and refetch outright when the browser reconnects.
export function useLiveProject(projectId: string, revisionId: string | null = null): void {
  const { api, openEvents } = useApp();
  const queryClient = useQueryClient();

  useEffect(() => {
    queryClient.setQueryData(keys.article(projectId, revisionId), "");
    queryClient.setQueryData(writingKey(projectId, revisionId), []);
    const currentRevision = (): string | null =>
      queryClient.getQueryData<ProjectBody>(keys.project(projectId))?.revisionId ?? null;
    const live = liveRefetch({
      everything: () => {
        void queryClient.invalidateQueries({ queryKey: keys.project(projectId) });
        void queryClient.invalidateQueries({ queryKey: keys.projects });
        void queryClient.invalidateQueries({ queryKey: checkpointKey(projectId) });
        void queryClient.invalidateQueries({ queryKey: reviewsKey(projectId) });
      },
      // The project alone carries the step's meter, what it is doing and which version is
      // current; the cost moves with each piece a step pays for.
      meter: () => {
        void queryClient.invalidateQueries({ queryKey: keys.project(projectId), exact: true });
        void queryClient.invalidateQueries({ queryKey: keys.runCost(projectId), exact: true });
      },
    });
    // A report's numbers are one piece of work's, and a step's row sums several, so its meter
    // is asked for rather than patched.
    const ask = (event: { readonly type: string }): void => {
      if (event.type === "stage.progress") live.progress();
      else live.all();
    };

    const unsubscribe = subscribeProject(openEvents, eventsUrl(api, `projects/${projectId}`), {
      refetch: live.all,
      accept: (event) => {
        if (
          event.type === "project.updated" ||
          (event.type === "project.state" && event.revisionId === undefined)
        )
          return true;
        if ((event.revisionId ?? null) === currentRevision()) return true;
        ask(event);
        return false;
      },
      previewWriting: (event) => {
        queryClient.setQueryData<readonly WritingPreview[]>(
          writingKey(projectId, currentRevision()),
          (seen) => appendWriting(seen ?? [], event),
        );
      },
      narrationPiece: () => {
        void queryClient.invalidateQueries({ queryKey: peaksKey(projectId, currentRevision()) });
      },
      appendArticle: (text) => {
        queryClient.setQueryData<string>(
          keys.article(projectId, currentRevision()),
          (seen) => `${seen ?? ""}${text}`,
        );
      },
      patch: (event) => {
        if (event.type === "stage.state" && event.state === "running") {
          queryClient.setQueryData<readonly WritingPreview[]>(
            writingKey(projectId, currentRevision()),
            (seen) =>
              (seen ?? []).filter(
                (one) =>
                  one.stage !== event.stage ||
                  one.workId !== event.workId ||
                  one.revisionId !== event.revisionId,
              ),
          );
          if (event.stage === "article")
            queryClient.setQueryData(keys.article(projectId, currentRevision()), "");
        }
        if (event.type !== "project.state" && event.workId !== undefined) {
          ask(event);
          return;
        }
        queryClient.setQueryData<ProjectBody>(keys.project(projectId), (seen) =>
          patchProject(seen, event),
        );
      },
    });

    return () => {
      unsubscribe();
      live.stop();
    };
  }, [api, openEvents, queryClient, projectId, revisionId]);
}
