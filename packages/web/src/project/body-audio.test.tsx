import type { Output } from "@app/slices/storage/model.js";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { body, output, stage } from "@/routes/project-fixtures";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { AudioBody } from "./body-audio.js";
import { RevisionControlContext } from "./revision-action-context.js";
import { revisionView } from "./revision-fixture.js";
import { RevisionMedia } from "./revision-media.js";

afterEach(cleanup);

const plain = output("audio_body", "audio", { id: "o-body", path: "body.mp3" });
const levelled = output("audio_levelled", "audio", {
  id: "o-levelled",
  path: "levelled.mp3",
  meta: { segment: "body" },
});

function mount(states: Readonly<Record<string, "ready" | "outdated">>) {
  const outputs: readonly Output[] = [plain, levelled];
  const audio = stage("audio", "done");
  const view = {
    ...revisionView(),
    outputs: outputs.map((one) => ({
      recordId: one.id,
      publicationId: null,
      selected: true,
      available: true,
      slot: one.id,
      workKey: one.role === "audio_levelled" ? "level:body" : "audio:body:concat",
      assetId: one.id,
      output: one,
      fingerprint: one.id,
      state: states[one.id] ?? ("ready" as const),
    })),
  };
  renderApp(
    <RevisionMedia projectId="p1" revisionId="r1">
      <RevisionControlContext value>
        <AudioBody
          stage={audio}
          project={{
            ...body({ status: "paused", stages: [audio], outputs }).project,
            format: "16:9" as const,
            config: revisionView().revision.config,
          }}
          outputs={outputs}
          busy={false}
          actions={{
            run: vi.fn(),
            pending: false,
            refusal: undefined,
            dismissRefusal: () => undefined,
          }}
        />
      </RevisionControlContext>
    </RevisionMedia>,
    testDeps({ "GET /api/projects/p1/revisions/r1": jsonAnswer({ view }) }),
  );
}

it("plays the new narration beside a levelled one an edit outdated, and says why", async () => {
  mount({ "o-levelled": "outdated" });
  expect(
    await screen.findByText(
      /Outdated: this is the levelled narration from before your last change/,
    ),
  ).toBeDefined();
  // The one the video plays until the run levels the new one, then the new one as spoken.
  expect(screen.getByRole("group", { name: "Body narration controls" })).toBeDefined();
  expect(
    screen.getByRole("group", { name: "Body narration, new, before levelling controls" }),
  ).toBeDefined();
});

it("plays only the levelled narration while it is current", async () => {
  mount({});
  expect(await screen.findByRole("group", { name: "Body narration controls" })).toBeDefined();
  expect(screen.queryByText(/Outdated:/)).toBeNull();
  expect(screen.queryByRole("group", { name: /new, before levelling/ })).toBeNull();
});
