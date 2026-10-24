import { stepFailedWhileWaiting } from "@app/slices/admission/state-words.js";
import { atItsDay, failuresOf, type NoticeSubject } from "@app/slices/notifications/rules.js";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { type Api, readProject } from "@/api";
import { useApp } from "@/app-context";
import { useToast } from "@/components/kit/toast";
import { projectsQuery } from "@/queries";
import {
  browserNotificationsReady,
  claimOnce,
  showBrowserNotification,
  showStartNotification,
  showTopicsNotification,
  storedTold,
} from "./browser.js";
import { playRunSound, runSoundsOn, unlockRunSounds } from "./sounds.js";
import { useAwaySummary } from "./use-away-summary.js";
import { createRunWatcher, type RunWatcher, type ShownToast } from "./watcher.js";

// The toast that says a run ended, on whatever page is open: "Video ready: Title" with Watch
// (the project's Video section), or Open for a run that made no video or failed. A failure stays
// until it is dismissed, as every error toast does.
export function runEndToast(notice: ShownToast): {
  readonly message: string;
  readonly tone: "success" | "info" | "error";
  readonly action: { readonly label: "Watch" | "Open"; readonly section?: "video" };
} {
  const watch = notice.makesVideo && notice.kind !== "failed";
  return {
    message: notice.text.headline,
    tone: notice.kind === "ready" ? "success" : notice.kind === "failed" ? "error" : "info",
    action: watch ? { label: "Watch", section: "video" } : { label: "Open" },
  };
}

// What a notification says about a project, from its page's body (`GET /api/projects/:id`), as
// the server's notifier reads it (`slices/notifications/subject.ts`).
export async function projectNoticeSubject(
  api: Api,
  projectId: string,
): Promise<Omit<NoticeSubject, "reason">> {
  const body = await readProject(api, projectId);
  const failures = failuresOf(body.stages);
  return {
    title: body.project.title,
    makesVideo: body.project.config.sources.video !== "off",
    startedBy: body.startedBy ?? null,
    waitingForAgent: body.project.waitingForAgent === true,
    status: body.project.status,
    atItsDay: atItsDay(body.project.prepared === true, body.holding),
    ...(stepFailedWhileWaiting(body.project.status, body.stages)
      ? { stepFailedWhileWaiting: true }
      : {}),
    ...(failures.length === 0 ? {} : { failures }),
  };
}

// The shell's one watcher. It rides the global event stream the shell already holds open, so
// notifications cost no extra connection; the only requests it makes are one project list
// when the page loads and one project read per notification.
export function useRunNotifications(): RunWatcher {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const notify = useToast();
  // Read through refs so a new navigate or toast never rebuilds the watcher and forgets what it
  // saw.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  // The other half of being told: what happened while no tab was looking.
  useAwaySummary();

  const watcher = useMemo(
    () =>
      createRunWatcher({
        enabled: browserNotificationsReady,
        sounds: runSoundsOn,
        play: playRunSound,
        showStart: (notice) => {
          showStartNotification(notice, (projectId) => {
            void navigateRef.current({ to: "/projects/$projectId", params: { projectId } });
          });
        },
        seed: async () =>
          (await queryClient.fetchQuery({ ...projectsQuery(api), staleTime: 5_000 })).projects,
        subject: (projectId) => projectNoticeSubject(api, projectId),
        claim: (key) => claimOnce(key),
        told: storedTold,
        showTopics: (notice) => {
          showTopicsNotification(notice, () => {
            void navigateRef.current({ to: "/calendar" });
          });
        },
        showReview: (notice) => {
          showBrowserNotification(notice, (projectId) => {
            void navigateRef.current({ to: "/projects/$projectId", params: { projectId } });
          });
        },
        show: (notice) => {
          showBrowserNotification(notice, (projectId) => {
            void navigateRef.current({ to: "/projects/$projectId", params: { projectId } });
          });
        },
        toast: (notice) => {
          const shown = runEndToast(notice);
          notifyRef.current(shown.message, shown.tone, {
            label: shown.action.label,
            run: () => {
              void navigateRef.current({
                to: "/projects/$projectId",
                params: { projectId: notice.projectId },
                ...(shown.action.section === undefined
                  ? {}
                  : { search: { section: shown.action.section } }),
              });
            },
          });
        },
        // A notification that couldn't be shown is not worth an error on screen: the project
        // list shows the same state a moment later.
        report: (error) => {
          console.warn("Slopify couldn't show a run notification.", error);
        },
      }),
    [api, queryClient],
  );

  useEffect(() => {
    // The end of a run is always said on the page, so what is running is always known.
    void watcher.seed();
    // Browsers keep a page silent until it is clicked once.
    window.addEventListener("pointerdown", unlockRunSounds, { once: true });
    window.addEventListener("keydown", unlockRunSounds, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockRunSounds);
      window.removeEventListener("keydown", unlockRunSounds);
    };
  }, [watcher]);

  return watcher;
}
