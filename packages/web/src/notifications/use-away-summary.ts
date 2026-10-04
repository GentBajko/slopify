import type { ProjectState } from "@app/kernel/pipeline.js";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useApp } from "@/app-context";
import { useToast } from "@/components/kit/toast";
import { projectsQuery } from "@/queries";
import { awayAfterMs, awayMessage, awaySummary, readSnapshot, writeSnapshot } from "./away.js";

// How often a page in view refreshes the snapshot, so a closed or crashed tab leaves a recent one.
const refreshMs = 30_000;

// On coming back to Slopify (the tab shown again, or opened after being closed), one toast says
// what the runs did meanwhile, with the way to Home where they wait.
export function useAwaySummary(): void {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  useEffect(() => {
    let stopped = false;
    const projects = async (): Promise<readonly { id: string; status: ProjectState }[]> =>
      (await client.fetchQuery({ ...projectsQuery(api), staleTime: 0 })).projects;
    const snapshot = async (): Promise<void> => {
      try {
        const now = await projects();
        if (!stopped)
          writeSnapshot({
            at: Date.now(),
            states: Object.fromEntries(now.map((one) => [one.id, one.status])),
          });
      } catch {
        // The next refresh tries again.
      }
    };
    const back = async (): Promise<void> => {
      const before = readSnapshot();
      if (before === undefined || Date.now() - before.at < awayAfterMs) {
        await snapshot();
        return;
      }
      try {
        const now = await projects();
        if (stopped) return;
        const message = awayMessage(awaySummary(before, now));
        writeSnapshot({
          at: Date.now(),
          states: Object.fromEntries(now.map((one) => [one.id, one.status])),
        });
        if (message !== undefined)
          notify(message, "info", {
            label: "Open Home",
            run: () => void navigateRef.current({ to: "/" }),
          });
      } catch {
        // The project list will show the same once it loads.
      }
    };
    const visibility = (): void => {
      if (document.visibilityState === "visible") void back();
      // Leaving: what is on screen now is what was seen.
      else void snapshot();
    };
    if (document.visibilityState === "visible") void back();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void snapshot();
    }, refreshMs);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [api, client, notify]);
}
