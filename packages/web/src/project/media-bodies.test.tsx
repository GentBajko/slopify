import { assetOf } from "@app/slices/storage/asset-name.js";
import type { Output } from "@app/slices/storage/model.js";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { body, output, stage } from "@/routes/project-fixtures";
import { jsonAnswer, renderApp, testDeps, testOrigin } from "@/test-app";
import type { BodyProps } from "./body.js";
import { ImagesBody } from "./body-images.js";
import { playerChapters, VideoBody } from "./body-video.js";
import {
  type EditRequest,
  EditRequestContext,
  RegenerateNowContext,
  RevisionControlContext,
} from "./revision-action-context.js";
import { revisionView } from "./revision-fixture.js";
import { RevisionMedia } from "./revision-media.js";
import type { Action } from "./use-actions.js";

afterEach(cleanup);

const url = (one: Output) => `${testOrigin}/files/p1/${assetOf(one)}`;

function props(outputs: readonly Output[], over: Pick<BodyProps, "companion"> = {}) {
  const run = vi.fn((_action: Action) => undefined);
  const images = stage("images", "done");
  const project = {
    ...body({ status: "done", stages: [images], outputs }).project,
    format: "16:9" as const,
    config: {
      ...revisionView().revision.config,
      sources: {
        ...revisionView().revision.config.sources,
        audio: "generate" as const,
        video: "generate" as const,
      },
    },
  };
  return {
    run,
    props: {
      stage: images,
      project,
      outputs,
      busy: false,
      actions: { run, pending: false, refusal: undefined, dismissRefusal: () => undefined },
      ...over,
    } satisfies BodyProps,
  };
}

const pictures = [1, 2].map((index) =>
  output("image", "images", {
    id: `o-image-${String(index)}`,
    path: `images/${String(index)}.png`,
    meta: { index, prompt: `Scene ${String(index)}` },
  }),
);

it("shows the images in the media grid, and offers Regenerate and Download at full size", async () => {
  const { props: given, run } = props(pictures);
  renderApp(<ImagesBody {...given} />, testDeps({}));
  const grid = screen
    .getByRole("region", { name: "Slideshow images" })
    .querySelector("[data-slot='media-grid']");
  expect(grid?.querySelectorAll("[data-slot='media-frame']")).toHaveLength(2);

  await userEvent.click(screen.getByRole("button", { name: "Open image 2 full size" }));
  const lightbox = await screen.findByRole("dialog", { name: /2 of 2/u });
  expect(
    within(lightbox).getByRole("link", { name: "Download image 2" }).getAttribute("href"),
  ).toBe(url(pictures[1] as Output));
  await userEvent.click(within(lightbox).getByRole("button", { name: "Regenerate image 2" }));
  // A project without saved versions asks first, then regenerates the picture shown.
  await userEvent.click(await screen.findByRole("button", { name: "Regenerate it" }));
  expect(run).toHaveBeenCalledWith({ kind: "regenerate-image", outputId: "o-image-2" });
});

function mountRevisioned(regenerateNow: (workKeys: readonly string[]) => void) {
  const requests: EditRequest[] = [];
  const { props: given, run } = props(pictures);
  const view = {
    ...revisionView(),
    outputs: pictures.map((one, index) => ({
      recordId: one.id,
      publicationId: null,
      selected: true,
      available: true,
      slot: one.id,
      workKey: `image:key-${String(index + 1)}`,
      assetId: one.id,
      output: one,
      fingerprint: "image",
      state: "ready" as const,
    })),
  };
  renderApp(
    <RevisionMedia projectId="p1" revisionId="r1">
      <RevisionControlContext value>
        <EditRequestContext value={(request) => requests.push(request)}>
          <RegenerateNowContext value={regenerateNow}>
            <ImagesBody {...given} />
          </RegenerateNowContext>
        </EditRequestContext>
      </RevisionControlContext>
    </RevisionMedia>,
    testDeps({ "GET /api/projects/p1/revisions/r1": jsonAnswer({ view }) }),
  );
  return { requests, run };
}

it("makes every image again at once from Regenerate all, after asking", async () => {
  const regenerateNow = vi.fn();
  const { requests } = mountRevisioned(regenerateNow);
  await userEvent.click(await screen.findByRole("button", { name: "Regenerate all" }));
  const dialog = await screen.findByRole("dialog", { name: "Regenerate all 2 images?" });
  expect(dialog.textContent).toContain("one paid image call each");
  expect(regenerateNow).not.toHaveBeenCalled();
  await userEvent.click(within(dialog).getByRole("button", { name: "Regenerate them" }));
  expect(regenerateNow).toHaveBeenCalledWith(["image:key-1", "image:key-2"]);
  // Nothing opens the settings on the way.
  expect(requests).toEqual([]);
});

it("makes one image again at once on a project with saved versions, leaving the video", async () => {
  const regenerateNow = vi.fn();
  const { requests, run } = mountRevisioned(regenerateNow);
  await screen.findByRole("button", { name: "Regenerate all" });
  await userEvent.click(screen.getByRole("button", { name: "Regenerate image 2" }));
  const dialog = await screen.findByRole("dialog", { name: "Regenerate this image?" });
  expect(dialog.textContent).toContain("The video keeps the current one until you remake it");
  await userEvent.click(within(dialog).getByRole("button", { name: "Regenerate the image" }));
  expect(regenerateNow).toHaveBeenCalledWith(["image:key-2"]);
  expect(run).not.toHaveBeenCalled();
  expect(requests).toEqual([]);
});

it("offers the thumbnail's Regenerate and Download in its lightbox too", async () => {
  const thumbnail = output("thumbnail", "thumbnail", {
    id: "o-thumb",
    path: "thumbnail.png",
    meta: { index: 1 },
  });
  const { props: given, run } = props([...pictures, thumbnail], {
    companion: stage("thumbnail", "done"),
  });
  renderApp(<ImagesBody {...given} />, testDeps({}));
  await userEvent.click(screen.getByRole("button", { name: "Open the thumbnail full size" }));
  const lightbox = await screen.findByRole("dialog", { name: /1 of 1/u });
  expect(
    within(lightbox).getByRole("link", { name: "Download the thumbnail" }).getAttribute("href"),
  ).toBe(url(thumbnail));
  await userEvent.click(within(lightbox).getByRole("button", { name: "Regenerate the thumbnail" }));
  await userEvent.click(await screen.findByRole("button", { name: "Regenerate it" }));
  expect(run).toHaveBeenCalledWith({ kind: "regenerate-image", outputId: "o-thumb" });
});

it("plays the final video with the first thumbnail as its poster", () => {
  const video = output("video", "video", { id: "o-video", path: "video.mp4" });
  const thumbnails = [2, 1].map((index) =>
    output("thumbnail", "thumbnail", {
      id: `o-thumb-${String(index)}`,
      path: `thumbnail-${String(index)}.png`,
      meta: { index },
    }),
  );
  const { props: given } = props([video, ...thumbnails]);
  renderApp(<VideoBody {...given} stage={stage("video", "done")} />, testDeps({}));
  const player = screen.getByLabelText("Generated video", { selector: "video" });
  expect(player.getAttribute("poster")).toBe(url(thumbnails[1] as Output));
});

it("turns the YouTube chapters into the player's marks, fitted as YouTube takes them", () => {
  expect(playerChapters("0:05 Intro\n1:00 The bowline\nA note\n2:30 Why it holds", 240)).toEqual([
    { start: 0, title: "Intro" },
    { start: 60, title: "The bowline" },
    { start: 150, title: "Why it holds" },
  ]);
  expect(playerChapters("")).toEqual([]);
});
