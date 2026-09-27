import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { PlayDraftProvider, type PlaySession, usePlaySession } from "@/play/draft-context";
import { draftView, playRoutes } from "@/play/play-test-fixture";
import { body, stage } from "@/routes/project-fixtures";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { NextActionPanel, useNextAction } from "./next-action-view.js";
import { revisionView } from "./revision-fixture.js";
import type { RevisionController } from "./revision-workspace.js";

// The first thing a person makes is a short; its next action opens Play on the long video
// about the same topic (`edge/http/onboarding.ts` builds the draft).

afterEach(cleanup);

let session: PlaySession | undefined;

function Harness() {
  session = usePlaySession();
  const summary = body({ status: "done", stages: [], outputs: [] }).project;
  const state = useNextAction({
    project: {
      ...summary,
      status: "done",
      format: "9:16",
      config: { ...revisionView().revision.config, mode: "short" },
    },
    stages: [stage("video", "done")],
    resumable: false,
    sample: false,
    gates: [],
    outdated: [],
    waits: [],
    uploadReady: true,
    actions: {
      run: () => undefined,
      pending: false,
      refusal: undefined,
      dismissRefusal: () => undefined,
    },
    controller: { review: () => undefined, pending: false } as unknown as RevisionController,
    openSection: () => undefined,
    openUpload: () => undefined,
  });
  return <NextActionPanel state={state} />;
}

it("opens Play on a draft for the full video when a finished short's action is pressed", async () => {
  const draftId = "00000000-0000-4000-8000-00000000f011";
  const posted: unknown[] = [];
  renderRouted(
    <PlayDraftProvider>
      <Harness />
    </PlayDraftProvider>,
    testDeps(
      playRoutes({
        "POST /api/onboarding/full-video": async (request) => {
          posted.push(await request.json());
          return jsonAnswer(draftView(draftId, "The Library of Alexandria"), 201)(request);
        },
        [`GET /api/drafts/${draftId}`]: jsonAnswer(draftView(draftId, "The Library of Alexandria")),
      }),
    ),
  );
  const next = await screen.findByRole("region", { name: "Next action" });
  expect(within(next).getByText("The short is ready.")).not.toBeNull();
  await userEvent.click(
    within(next).getByRole("button", { name: "Make the full video on this topic" }),
  );
  await waitFor(() => expect(session?.activeId).toBe(draftId));
  expect(session?.document.form.title).toBe("The Library of Alexandria");
  expect(posted).toEqual([
    {
      projectId: body({ status: "done", stages: [], outputs: [] }).project.id,
      draftId: expect.any(String),
    },
  ]);
});
