import type { GlobalEvent } from "@app/edge/events/hub.js";
import type { StageStateEvent } from "@app/kernel/events.js";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAppRouter } from "@/router";
import { body, stage } from "@/routes/project-fixtures";
import { jsonAnswer, renderApp, testDeps, testVersion } from "@/test-app";

// The shell's run notifications as they are wired: the global event stream's frames, the
// project's page read for the subject, and the browser's Notification and storage.

const shown: string[] = [];
let stored: Map<string, string>;

beforeEach(() => {
  shown.length = 0;
  stored = new Map([["slopify.notifications.browser", "on"]]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  });
  vi.stubGlobal(
    "Notification",
    class {
      static readonly permission = "granted";
      onclick: (() => void) | null = null;
      constructor(headline: string) {
        shown.push(headline);
      }
      close(): void {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const failedAt = "2026-10-11T10:00:00.000Z";

// The narration failed while the images still run: beside a thumbnail parked at the person's
// checkpoint, or with nothing waiting.
function running(parked: boolean) {
  return body({
    status: "running",
    stages: [
      stage("article", "done"),
      stage("audio", "failed", {
        finishedAt: failedAt,
        failureReason: "The narration was refused.",
      }),
      stage("images", "running"),
      stage("thumbnail", "pending", parked ? { parked: true } : {}),
    ],
    outputs: [],
  });
}

async function shell(parked: boolean) {
  const page = running(parked);
  const read = vi.fn(jsonAnswer(page));
  const listeners = new Map<string, ((message: MessageEvent<string>) => void)[]>();
  const app = testDeps({
    "GET /api/projects": jsonAnswer({ projects: [{ ...page.project, progress: 0.4 }] }),
    "GET /api/projects/p1": read,
    "GET /api/settings": jsonAnswer({ silenceGapSeconds: 3, appearance: "system" }),
    "GET /api/telemetry/notice": jsonAnswer({ seen: true, appVersion: testVersion }),
  });
  const router = createAppRouter();
  router.update({ history: createMemoryHistory({ initialEntries: ["/projects"] }) });
  renderApp(<RouterProvider router={router} />, {
    ...app,
    openEvents: () => ({
      close: () => {},
      addEventListener: (name: string, listener: (message: MessageEvent<string>) => void) =>
        listeners.set(name, [...(listeners.get(name) ?? []), listener]),
    }),
  });
  await screen.findByText("Running", { selector: "[data-slot=status]" });
  const send = (event: GlobalEvent | StageStateEvent) => {
    act(() => {
      for (const listener of listeners.get(event.type) ?? [])
        listener(new MessageEvent(event.type, { data: JSON.stringify(event) }));
    });
  };
  return { send, read };
}

const narrationFailed: StageStateEvent = {
  type: "stage.state",
  projectId: "p1",
  stage: "audio",
  state: "failed",
  failureReason: "The narration was refused.",
};

// The person's decision (2026-10-10): a step that fails while another waits is told right away,
// though a third still runs; and kept as told in this browser, so a reload doesn't tell it again.
it("tells Step failed as a step fails while another waits at the person's checkpoint", async () => {
  const { send } = await shell(true);
  send(narrationFailed);
  await vi.waitFor(() =>
    expect(shown).toEqual(["Step failed: Rope Tricks — The narration was refused."]),
  );
  expect(JSON.parse(stored.get("slopify.notifications.told") ?? "{}")).toEqual({
    p1: [`audio@${failedAt}`],
  });
});

// The person's decision (2026-10-11): with nothing waiting, the run's end notice tells it.
it("says nothing as a step fails in a run with nothing waiting", async () => {
  const { send, read } = await shell(false);
  send(narrationFailed);
  // The page is read for the subject; nothing is shown once it answers.
  await vi.waitFor(() => expect(read).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(shown).toEqual([]);
});
