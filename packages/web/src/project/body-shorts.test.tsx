import type { StageState } from "@app/kernel/pipeline.js";
import type { Output } from "@app/slices/storage/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { body, output, stage } from "@/routes/project-fixtures";
import { jsonAnswer, renderApp, testDeps, testOrigin } from "@/test-app";
import { ShortsBlock } from "./body-shorts.js";
import {
  type EditRequest,
  EditRequestContext,
  RevisionControlContext,
} from "./revision-action-context.js";
import { revisionView } from "./revision-fixture.js";
import { RevisionMedia } from "./revision-media.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const list = JSON.stringify({
  shorts: [
    {
      number: 1,
      first: 1,
      last: 4,
      start: 1.75,
      end: 62.5,
      title: "Why rope holds",
      description: "Friction does the work.",
      hashtags: ["#Rope", "#Knots", "#Friction"],
      why: "It opens on a question.",
    },
    {
      number: 2,
      first: 9,
      last: 14,
      start: 90,
      end: 180,
      title: "The knot sailors trust",
      description: "One knot, every boat.",
      hashtags: ["#Sailing", "#Bowline", "#Knots"],
      why: "A clear payoff.",
    },
  ],
});

const pick = output("shorts", "video", { id: "o-shorts" });
const first = output("short_video", "video", {
  id: "o-short-1",
  durationMs: 60_750,
  meta: { short: 1 },
});
const images = [1, 2, 3].map((index) =>
  output("short_image", "video", { id: `o-short-2-${String(index)}`, meta: { short: 2, index } }),
);

function mount(
  outputs: readonly Output[],
  state: StageState = "done",
  failureReason?: string,
  options: {
    readonly fullVideoLink?: string;
    readonly requestEdit?: (request: EditRequest) => void;
  } = {},
) {
  const video = stage("video", state, { failureReason: failureReason ?? null });
  const config = {
    ...revisionView().revision.config,
    imageSeconds: 15,
    shorts: {
      enabled: true,
      count: 2,
      minSeconds: 30,
      maxSeconds: 90,
      ...(options.fullVideoLink === undefined ? {} : { fullVideoLink: options.fullVideoLink }),
    },
  };
  const project = {
    ...body({ status: "done", stages: [video], outputs }).project,
    format: "16:9" as const,
    config,
  };
  const view = {
    ...revisionView(),
    outputs: outputs.map((one) => ({
      recordId: one.id,
      publicationId: null,
      selected: true,
      available: true,
      slot: one.id,
      workKey: one.role === "shorts" ? "shorts:pick" : "shorts:1:render",
      assetId: one.id,
      output: one,
      fingerprint: "shorts",
      state: "ready" as const,
    })),
  };
  renderApp(
    <RevisionMedia projectId="p1" revisionId="r1">
      <RevisionControlContext value>
        <EditRequestContext value={options.requestEdit}>
          <ShortsBlock stage={video} project={project} outputs={outputs} />
        </EditRequestContext>
      </RevisionControlContext>
    </RevisionMedia>,
    testDeps({
      "GET /api/projects/p1/revisions/r1": jsonAnswer({ view }),
      "GET /files/p1/revisions/r1/o-shorts": () => new Response(list),
    }),
  );
}

it("shows each short as a small vertical player with its title, length, Copy and download", async () => {
  const writeText = vi.fn(async () => undefined);
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  mount([pick, first]);
  const block = screen.getByRole("region", { name: "Shorts" });
  // A part of the stage body under a rule, not a bordered box inside the stage's own card.
  expect(block.className).not.toContain("rounded");
  const cards = await within(block).findAllByRole("listitem");
  expect(cards.map((card) => within(card).getByRole("heading").textContent)).toEqual([
    "Why rope holds",
    "The knot sailors trust",
  ]);
  const [one, two] = cards;
  if (one === undefined || two === undefined) throw new Error("Expected two shorts");
  const player = await within(one).findByLabelText("Short 1");
  expect(player.tagName).toBe("VIDEO");
  expect(player.className).toContain("aspect-[9/16]");
  expect(within(one).getByText("01:01")).not.toBeNull();
  expect(within(one).getByText("#Rope #Knots #Friction")).not.toBeNull();
  expect(within(one).getByRole("link", { name: "Download" }).getAttribute("href")).toBe(
    `${testOrigin}/files/p1/revisions/r1/o-short-1`,
  );
  // Not rendered yet, and the stage is not running: it says so where the player will be.
  expect(within(two).getByText("Not made yet. It is made with the video.")).not.toBeNull();
  expect(within(two).queryByRole("link", { name: "Download" })).toBeNull();

  await userEvent.click(
    within(two).getByRole("button", {
      name: "Copy short 2's title, description and hashtags",
    }),
  );
  expect(writeText).toHaveBeenLastCalledWith(
    "The knot sailors trust\n\nOne knot, every boat.\nWatch the full video: [PASTE THE FULL VIDEO LINK HERE]\n\n#Sailing #Bowline #Knots",
  );
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Copied short 2."));
});

it("says how far each short got while the stage runs, and which one failed", async () => {
  mount([pick, ...images.slice(0, 2)], "running");
  // 90 s at 15 s per image: six images, two made.
  expect(await screen.findByText("Making images · 2 of 6")).not.toBeNull();
  cleanup();
  mount(
    [pick, ...images],
    "failed",
    "Short 2: The audio/video export failed (ffmpeg exited with code 1).",
  );
  expect(
    await screen.findByText(
      "Couldn't make this short. Open Error details above to see why, then Retry stage.",
    ),
  ).not.toBeNull();
  expect(screen.getAllByText("Not made yet. It is made with the video.")).toHaveLength(1);
});

it("does not show a video made before the current pick under the new clip", async () => {
  mount([
    { ...pick, createdAt: "2026-09-04T00:00:00.000Z" },
    { ...first, createdAt: "2026-09-03T00:00:00.000Z" },
  ]);
  const cards = await screen.findAllByRole("listitem");
  expect(within(cards[0] as HTMLElement).queryByLabelText("Short 1")).toBeNull();
  expect(screen.getAllByText("Not made yet. It is made with the video.")).toHaveLength(2);
});

it("says the clips come after the subtitle timing before they are picked", () => {
  mount([], "running");
  expect(screen.getByText("The clips are picked after the subtitle timing.")).not.toBeNull();
});

it("ends the copied description with the project's link to the full video", async () => {
  const writeText = vi.fn(async () => undefined);
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  mount([pick, first], "done", undefined, { fullVideoLink: "https://youtu.be/rope" });
  const cards = await screen.findAllByRole("listitem");
  expect(
    within(cards[0] as HTMLElement).getByText("Watch the full video: https://youtu.be/rope"),
  ).not.toBeNull();
  await userEvent.click(
    screen.getByRole("button", { name: "Copy short 1's title, description and hashtags" }),
  );
  expect(writeText).toHaveBeenLastCalledWith(
    "Why rope holds\n\nFriction does the work.\nWatch the full video: https://youtu.be/rope\n\n#Rope #Knots #Friction",
  );
});

it("keeps showing a short made before the pick when the pick chose the same sentences", async () => {
  mount([
    { ...pick, createdAt: "2026-09-04T00:00:00.000Z" },
    { ...first, createdAt: "2026-09-03T00:00:00.000Z", meta: { short: 1, sentences: [1, 4] } },
  ]);
  const cards = await screen.findAllByRole("listitem");
  expect(await within(cards[0] as HTMLElement).findByLabelText("Short 1")).not.toBeNull();
});

it("opens Edit project to make one short again, or to pick different moments", async () => {
  const requests: EditRequest[] = [];
  mount([pick, first], "done", undefined, { requestEdit: (request) => requests.push(request) });
  const cards = await screen.findAllByRole("listitem");
  await userEvent.click(
    within(cards[1] as HTMLElement).getByRole("button", { name: "Make short 2 again" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Pick different moments" }));
  const view = revisionView();
  const edit = {
    config: view.revision.config,
    content: {
      ...view.revision.content,
      shortsRanges: { "1": { first: 2, last: 4, pick: "fingerprint" } },
    },
  };
  expect(requests.map((request) => request.section)).toEqual(["shorts", "shorts"]);
  expect(requests[0]?.change(edit, view).regenerate).toEqual(["shorts:2"]);
  // The moments picked again drop the ranges set on the old ones.
  const again = requests[1]?.change(edit, view);
  expect(again?.regenerate).toEqual(["shorts:pick"]);
  expect(again?.content.shortsRanges).toBeUndefined();
});

it("offers no remake outside a project that has versions", async () => {
  mount([pick, first]);
  await screen.findAllByRole("listitem");
  expect(screen.queryByRole("button", { name: "Pick different moments" })).toBeNull();
  expect(screen.queryByRole("button", { name: /again/ })).toBeNull();
});
