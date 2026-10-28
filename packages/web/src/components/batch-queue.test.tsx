import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { emptyAnswer, jsonAnswer, renderApp, renderRouted, testDeps } from "@/test-app";
import { BatchQueueCount, QueueItemActions } from "./batch-queue";

afterEach(cleanup);

describe("QueueItemActions", () => {
  it("moves a waiting video, and removes it to the Trash with Undo", async () => {
    const calls: string[] = [];
    renderApp(
      <QueueItemActions projectId="p1" title="Rohan" place={1} waiting={3} />,
      testDeps({
        "POST /api/projects/queue/p1/move": async (request) => {
          calls.push(`move ${await request.text()}`);
          return jsonAnswer({ queue: [] })(request);
        },
        "DELETE /api/projects/p1": (request) => {
          calls.push("trash");
          return emptyAnswer()(request);
        },
        "POST /api/trash/project/p1/restore": (request) => {
          calls.push("restore");
          return jsonAnswer({ restored: { kind: "project", id: "p1" } })(request);
        },
      }),
    );
    const earlier = screen.getByRole("button", { name: "Move Rohan earlier in the queue" });
    // Named in words on the button, not an arrow.
    expect(earlier.textContent).toBe("Earlier");
    await userEvent.click(earlier);
    await waitFor(() => expect(calls).toEqual(['move {"by":-1}']));
    await userEvent.click(screen.getByRole("button", { name: "Remove Rohan from the queue" }));
    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(calls).toEqual(['move {"by":-1}', "trash", "restore"]));
  });

  // A move that cannot happen is not offered, rather than drawn greyed.
  it("offers no Earlier to the first waiting video and no Later to the last", () => {
    renderApp(<QueueItemActions projectId="p1" title="Arda" place={0} waiting={2} />, testDeps({}));
    expect(screen.queryByRole("button", { name: "Move Arda earlier in the queue" })).toBeNull();
    expect(screen.getByRole("button", { name: "Move Arda later in the queue" })).not.toBeNull();
    cleanup();
    renderApp(<QueueItemActions projectId="p2" title="Bea" place={1} waiting={2} />, testDeps({}));
    expect(screen.queryByRole("button", { name: "Move Bea later in the queue" })).toBeNull();
  });
});

describe("BatchQueueCount", () => {
  const listing = { projects: [] };

  it("says nothing while no video waits in the queue", async () => {
    const queue = { queue: [{ projectId: "p1", batchId: "b", position: 0, state: "active" }] };
    const { container } = renderRouted(
      <BatchQueueCount projectId="p1" />,
      testDeps({
        "GET /api/projects/queue": jsonAnswer(queue),
        "GET /api/projects": jsonAnswer(listing),
      }),
    );
    await waitFor(() => expect(container.textContent).toBe(""));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says how many videos wait, and lists them in order", async () => {
    const queue = {
      queue: [
        { projectId: "p1", batchId: "b", position: 0, state: "active" },
        { projectId: "p2", batchId: "b", position: 1, state: "queued" },
        { projectId: "p3", batchId: "b", position: 2, state: "queued" },
      ],
    };
    renderRouted(
      <BatchQueueCount projectId="p1" />,
      testDeps({
        "GET /api/projects/queue": jsonAnswer(queue),
        "GET /api/projects": jsonAnswer(listing),
      }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "2 videos waiting to start" }));
    const list = await screen.findByRole("list", { name: "Waiting to start" });
    expect(list.querySelectorAll("li")).toHaveLength(2);
  });

  // A project started on its own has no part in the queue: its page says nothing of it.
  it("says nothing on a project the queue does not hold", async () => {
    const queue = {
      queue: [
        { projectId: "p1", batchId: "b", position: 0, state: "active" },
        { projectId: "p2", batchId: "b", position: 1, state: "queued" },
      ],
    };
    const fetched: string[] = [];
    const { container } = renderRouted(
      <BatchQueueCount projectId="solo" />,
      testDeps({
        "GET /api/projects/queue": (request) => {
          fetched.push("queue");
          return jsonAnswer(queue)(request);
        },
        "GET /api/projects": jsonAnswer(listing),
      }),
    );
    await waitFor(() => expect(fetched.length).toBeGreaterThan(0));
    await waitFor(() => expect(container.textContent).toBe(""));
  });
});
