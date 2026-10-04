import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { emptyAnswer, jsonAnswer, renderApp, testDeps } from "@/test-app";
import { QueueItemActions } from "./batch-queue";

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
    await userEvent.click(screen.getByRole("button", { name: "Move Rohan earlier in the queue" }));
    await waitFor(() => expect(calls).toEqual(['move {"by":-1}']));
    await userEvent.click(screen.getByRole("button", { name: "Remove Rohan from the queue" }));
    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(calls).toEqual(['move {"by":-1}', "trash", "restore"]));
  });

  it("keeps the first waiting video from moving earlier", () => {
    renderApp(<QueueItemActions projectId="p1" title="Arda" place={0} waiting={2} />, testDeps({}));
    expect(screen.getByRole("button", { name: "Move Arda earlier in the queue" })).toHaveProperty(
      "disabled",
      true,
    );
  });
});
