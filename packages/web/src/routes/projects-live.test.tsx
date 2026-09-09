import type { GlobalEvent } from "@app/edge/events/hub.js";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createAppRouter } from "@/router";
import { jsonAnswer, renderApp, testDeps, testVersion } from "@/test-app";
import { body, stage } from "./project-fixtures";

afterEach(cleanup);

it("refreshes the Projects list when another window pauses a failed run without a tally change", async () => {
  const initial = body({ status: "failed", stages: [stage("article", "failed")], outputs: [] });
  let project = { ...initial.project, progress: 0 };
  const read = vi.fn((request: Request) => jsonAnswer({ projects: [project] })(request));
  const listeners = new Map<string, ((message: MessageEvent<string>) => void)[]>();
  const app = testDeps({
    "GET /api/projects": read,
    "GET /api/settings": jsonAnswer({ silenceGapSeconds: 3, appearance: "system" }),
    "GET /api/telemetry/notice": jsonAnswer({ seen: true, appVersion: testVersion }),
  });
  const router = createAppRouter();
  router.update({ history: createMemoryHistory({ initialEntries: ["/"] }) });
  renderApp(<RouterProvider router={router} />, {
    ...app,
    openEvents: () => ({
      close: () => {},
      addEventListener: (name: string, listener: (message: MessageEvent<string>) => void) =>
        listeners.set(name, [...(listeners.get(name) ?? []), listener]),
    }),
  });
  await screen.findByText("failed");
  const before = read.mock.calls.length;
  project = { ...project, status: "paused" };
  const event: GlobalEvent = { type: "project.state", projectId: "p1", state: "paused" };
  act(() => {
    for (const listener of listeners.get(event.type) ?? [])
      listener(new MessageEvent(event.type, { data: JSON.stringify(event) }));
  });
  await screen.findByText("paused");
  await waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(before));
  expect(screen.queryByText("failed")).toBeNull();
});
