import type { Output } from "@app/slices/storage/model.js";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { stubMedia } from "@/components/kit/media-stub";
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

it("reads the narration as a transcript in step with its player once the caption timing is current", async () => {
  const user = userEvent.setup();
  const spoken = output("audio_body", "audio", { id: "o-spoken", durationMs: 10_000 });
  const text = output("narration_txt", "audio", { id: "o-text", meta: { segment: "body" } });
  const words = output("subtitle_words", "video", { id: "o-words" });
  const outputs: readonly Output[] = [spoken, text, words];
  const audio = stage("audio", "done");
  const config = { ...revisionView().revision.config, edgeSilenceSeconds: 1, silenceGapSeconds: 0 };
  const view = {
    ...revisionView(),
    outputs: outputs.map((one) => ({
      recordId: one.id,
      publicationId: null,
      selected: true,
      available: true,
      slot: one.id,
      workKey: one.id,
      assetId: one.id,
      output: one,
      fingerprint: one.id,
      state: "ready" as const,
    })),
  };
  renderApp(
    <RevisionMedia projectId="p1" revisionId="r1">
      <AudioBody
        stage={audio}
        project={{
          ...body({ status: "done", stages: [audio], outputs }).project,
          format: "16:9" as const,
          config,
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
    </RevisionMedia>,
    testDeps({
      "GET /api/projects/p1/revisions/r1": jsonAnswer({ view }),
      "GET /files/p1/revisions/r1/o-text": () => new Response("Hello there. Welcome back."),
      "GET /files/p1/revisions/r1/o-words": jsonAnswer({
        words: [
          { text: "Hello", start: 2, end: 2.4 },
          { text: "there.", start: 2.5, end: 3 },
          { text: "Welcome", start: 4, end: 4.5 },
          { text: "back.", start: 4.6, end: 5 },
        ],
      }),
    }),
  );
  const line = await screen.findByRole("button", { name: "Welcome back." });
  const player = screen.getByLabelText("Body narration");
  if (!(player instanceof HTMLAudioElement)) throw new Error("Expected the body player.");
  stubMedia(player);
  await user.click(line);
  // 4 s on the narration timeline is 3 s into the body file, after the 1 s lead-in.
  expect(player.currentTime).toBe(3);
  expect(screen.getByRole("button", { name: "Play from 0:04" })).toBeDefined();
});
