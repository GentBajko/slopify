import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { readProject } from "@/api";
import { useApp } from "@/app-context";
import { projectsQuery } from "@/queries";
import {
  browserNotificationsReady,
  claimOnce,
  onBrowserNotificationsChange,
  showBrowserNotification,
  showStartNotification,
  showTopicsNotification,
} from "./browser.js";
import { onRunSoundsChange, playRunSound, runSoundsOn, unlockRunSounds } from "./sounds.js";
import { useAwaySummary } from "./use-away-summary.js";
import { createRunWatcher, type RunWatcher } from "./watcher.js";

// The shell's one watcher. It rides the global event stream the shell already holds open, so
// notifications cost no extra connection; the only requests it makes are one project list
// when turned on and one project read per notification.
export function useRunNotifications(): RunWatcher {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Read through a ref so a new navigate never rebuilds the watcher and forgets what it saw.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
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
        subject: async (projectId) => {
          const body = await readProject(api, projectId);
          return {
            title: body.project.title,
            makesVideo: body.project.config.sources.video !== "off",
            reason:
              body.stages.find((stage) => stage.state === "failed")?.failureReason ?? undefined,
          };
        },
        claim: (key) => claimOnce(key),
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
        // A notification that couldn't be shown is not worth an error on screen: the project
        // list shows the same state a moment later.
        report: (error) => {
          console.warn("Slopify couldn't show a run notification.", error);
        },
      }),
    [api, queryClient],
  );

  useEffect(() => {
    const listening = (): boolean => browserNotificationsReady() || runSoundsOn();
    if (listening()) void watcher.seed();
    const seed = (): void => {
      if (listening()) void watcher.seed();
    };
    const stopNotifications = onBrowserNotificationsChange(seed);
    const stopSounds = onRunSoundsChange(seed);
    // Browsers keep a page silent until it is clicked once.
    window.addEventListener("pointerdown", unlockRunSounds, { once: true });
    window.addEventListener("keydown", unlockRunSounds, { once: true });
    return () => {
      stopNotifications();
      stopSounds();
      window.removeEventListener("pointerdown", unlockRunSounds);
      window.removeEventListener("keydown", unlockRunSounds);
    };
  }, [watcher]);

  return watcher;
}
