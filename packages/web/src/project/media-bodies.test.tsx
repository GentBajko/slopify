import { assetOf } from "@app/slices/storage/asset-name.js";
import type { Output } from "@app/slices/storage/model.js";
import { defaultVoicesSettings } from "@app/slices/voices/model.js";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { stubMedia } from "@/components/kit/media-stub";
import { body, output, stage } from "@/routes/project-fixtures";
import { jsonAnswer, renderApp, renderRouted, testDeps, testOrigin } from "@/test-app";
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

it("names each image by its own scene, not the prompt's shared opening", () => {
  const shared = "Create an official illustration in the style of the core rulebooks.";
  const scened = [1, 2].map((index) =>
    output("image", "images", {
      id: `o-scene-${String(index)}`,
      path: `images/${String(index)}.png`,
      meta: {
        index,
        prompt: `${shared}\n\nScene: ${index === 1 ? "A priestess before a rift." : "Islands over a sea."}\n\nNo text.`,
      },
    }),
  );
  renderApp(<ImagesBody {...props(scened).props} />, testDeps({}));
  const grid = screen.getByRole("region", { name: "Images × 2" });
  expect(within(grid).getByText("A priestess before a rift.")).toBeTruthy();
  expect(within(grid).getByText("Islands over a sea.")).toBeTruthy();
});

it("says an image's prompt once in its lightbox: its scene on the bar, the prompt below", async () => {
  const prompt = (scene: string) =>
    `Create an official illustration about "Caves". Scene: ${scene} Composition: a wide view.`;
  const scened = ["A priestess before a rift.", "Islands over a sea."].map((scene, at) =>
    output("image", "images", {
      id: `o-scene-${String(at)}`,
      path: `images/${String(at)}.png`,
      meta: { index: at + 1, prompt: prompt(scene) },
    }),
  );
  renderApp(<ImagesBody {...props(scened).props} />, testDeps({}));
  await userEvent.click(screen.getByRole("button", { name: "Open image 1 full size" }));
  const lightbox = await screen.findByRole("dialog", {
    name: "1 of 2 · A priestess before a rift.",
  });
  expect(within(lightbox).getAllByText(prompt("A priestess before a rift."))).toHaveLength(1);
});

it("shows the images in one grid, each with its actions in words at rest and at full size", async () => {
  const { props: given, run } = props(pictures);
  renderApp(<ImagesBody {...given} />, testDeps({}));
  const grid = screen
    .getByRole("region", { name: "Images × 2" })
    .querySelector("[data-slot='media-grid']");
  expect(grid?.querySelectorAll("[data-slot='media-frame']")).toHaveLength(2);
  // At rest, in words: no hover is needed to find them.
  const tile = grid?.querySelectorAll("[data-slot='media-frame']")[1] as HTMLElement;
  expect(
    within(tile).getByRole("button", { name: "Make this image again for image 2" }),
  ).toBeTruthy();
  expect(within(tile).getByRole("link", { name: "Download image 2" }).textContent).toBe(
    "Download image 2",
  );
  expect(within(tile).getByRole("button", { name: "More for image 2" })).toBeTruthy();
  expect(within(tile).getByRole("button", { name: "Open image 2 full size" }).textContent).toBe(
    "Full size",
  );

  await userEvent.click(screen.getByRole("button", { name: "Open image 2 full size" }));
  const lightbox = await screen.findByRole("dialog", { name: /2 of 2/u });
  expect(
    within(lightbox).getByRole("link", { name: "Download image 2" }).getAttribute("href"),
  ).toBe(url(pictures[1] as Output));
  await userEvent.click(
    within(lightbox).getByRole("button", { name: "Make this image again for image 2" }),
  );
  // A project without saved versions asks first, price first, then makes the picture shown.
  const dialog = await screen.findByRole("dialog", { name: "Make this image again?" });
  expect(dialog.textContent).toContain("1 paid image call");
  await userEvent.click(within(dialog).getByRole("button", { name: "Make it again" }));
  expect(run).toHaveBeenCalledWith({ kind: "regenerate-image", outputId: "o-image-2" });
});

it("deletes an image from its More menu, after asking", async () => {
  const { props: given, run } = props(pictures);
  renderApp(<ImagesBody {...given} />, testDeps({}));
  await userEvent.click(screen.getByRole("button", { name: "More for image 1" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Delete image 1" }));
  const dialog = await screen.findByRole("dialog", { name: "Delete this image?" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Delete the image" }));
  expect(run).toHaveBeenCalledWith({ kind: "delete-image", outputId: "o-image-1" });
});

function mountRevisioned(
  regenerateNow: (workKeys: readonly string[]) => void,
  status: "done" | "running" = "done",
) {
  const requests: EditRequest[] = [];
  const { props: made, run } = props(pictures);
  const given = { ...made, project: { ...made.project, status } };
  const base = revisionView();
  const view = {
    ...base,
    // Images drawn from prompts, so the stage can be made again as well as each picture.
    revision: {
      ...base.revision,
      config: {
        ...base.revision.config,
        sources: { ...base.revision.config.sources, images: "generate" as const },
      },
      content: {
        ...base.revision.content,
        imageOrder: ["key-1", "key-2"],
        imageDefinitions: {
          "key-1": { source: "generate" as const, prompt: "Scene 1", assetId: null },
          "key-2": { source: "generate" as const, prompt: "Scene 2", assetId: null },
        },
      },
    },
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

it("makes every image again from the head's one button, with or without the video", async () => {
  const regenerateNow = vi.fn();
  const { requests, run } = mountRevisioned(regenerateNow);
  const again = await screen.findByRole("button", {
    name: "Make all 2 images again · 2 image calls",
  });
  // Ticked by default: the images and then the video, the stage made again.
  await userEvent.click(again);
  let dialog = await screen.findByRole("dialog", { name: "Make all 2 images again?" });
  const tick = within(dialog).getByRole("checkbox", {
    name: "Also make the video again with them (free)",
  });
  expect((tick as HTMLInputElement).checked).toBe(true);
  await userEvent.click(within(dialog).getByRole("button", { name: "Make all 2 images again" }));
  expect(run).toHaveBeenCalledWith({ kind: "rerun", stage: "images" });
  expect(regenerateNow).not.toHaveBeenCalled();
  // Unticked: the pictures now, the video left as it is until it is made again.
  await userEvent.click(again);
  dialog = await screen.findByRole("dialog", { name: "Make all 2 images again?" });
  await userEvent.click(within(dialog).getByRole("checkbox"));
  expect(dialog.textContent).toContain("the video keeps the current pictures");
  await userEvent.click(within(dialog).getByRole("button", { name: "Make all 2 images again" }));
  // No price on record: the dialog said so, and pressing on accepts it.
  expect(dialog.textContent).toContain(
    "2 paid image calls; the image service's price isn't known in advance. Draws every image again now",
  );
  expect(regenerateNow).toHaveBeenCalledWith(["image:key-1", "image:key-2"], {
    approvedUpTo: undefined,
    unknownPrices: true,
  });
  // Nothing opens the settings on the way.
  expect(requests).toEqual([]);
});

it("leaves the pictures' make-again buttons out while the project is at work", async () => {
  mountRevisioned(vi.fn(), "running");
  // The tiles are there, with their downloads; nothing that could not start is drawn greyed.
  expect(await screen.findAllByRole("link", { name: /^Download image/ })).toHaveLength(2);
  expect(screen.queryByRole("button", { name: /^Make all 2 images again/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Make this image again/ })).toBeNull();
});

it("makes one image again at once on a project with saved versions, leaving the video", async () => {
  const regenerateNow = vi.fn();
  const { requests, run } = mountRevisioned(regenerateNow);
  await screen.findByRole("button", { name: /^Make all 2 images again/ });
  await userEvent.click(screen.getByRole("button", { name: "Make this image again for image 2" }));
  const dialog = await screen.findByRole("dialog", { name: "Make this image again?" });
  expect(dialog.textContent).toContain(
    "the video keeps the current one until the video is made again",
  );
  expect(dialog.textContent).toContain(
    "1 paid image call; the image service's price isn't known in advance.",
  );
  expect(dialog.textContent).toContain("the old image stays under Versions");
  await userEvent.click(within(dialog).getByRole("button", { name: "Make it again" }));
  expect(regenerateNow).toHaveBeenCalledWith(["image:key-2"], {
    approvedUpTo: undefined,
    unknownPrices: true,
  });
  expect(run).not.toHaveBeenCalled();
  expect(requests).toEqual([]);
});

it("leads the grid with the thumbnail, badged, with its own actions in its lightbox too", async () => {
  const thumbnail = output("thumbnail", "thumbnail", {
    id: "o-thumb",
    path: "thumbnail.png",
    meta: { index: 1 },
  });
  const { props: given, run } = props([...pictures, thumbnail], {
    companion: stage("thumbnail", "done"),
  });
  renderApp(<ImagesBody {...given} />, testDeps({}));
  const frames = screen
    .getByRole("region", { name: "Images × 2" })
    .querySelectorAll("[data-slot='media-frame']");
  expect(frames).toHaveLength(3);
  expect(within(frames[0] as HTMLElement).getByText("Thumbnail")).toBeTruthy();
  // The images' zip holds the images only; the thumbnail has its own Download.
  expect(screen.getByRole("link", { name: "Download both images (.zip)" })).toBeTruthy();
  expect(screen.getByText("2 in the video + thumbnail")).toBeTruthy();
  // How YouTube shows it, in sight on the tile.
  await userEvent.click(
    within(frames[0] as HTMLElement).getByRole("button", { name: "See it as YouTube shows it" }),
  );
  const preview = await screen.findByRole("dialog", { name: "The thumbnail on YouTube" });
  await userEvent.click(within(preview).getByRole("button", { name: "Close" }));
  await userEvent.click(screen.getByRole("button", { name: "Open the thumbnail full size" }));
  const lightbox = await screen.findByRole("dialog", { name: /1 of 3/u });
  expect(
    within(lightbox).getByRole("link", { name: "Download the thumbnail" }).getAttribute("href"),
  ).toBe(url(thumbnail));
  await userEvent.click(within(lightbox).getByRole("button", { name: "Make the thumbnail again" }));
  const dialog = await screen.findByRole("dialog", { name: "Make the thumbnail again?" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Make it again" }));
  expect(run).toHaveBeenCalledWith({ kind: "regenerate-image", outputId: "o-thumb" });
});

it("plays the final video with the first thumbnail as its poster", async () => {
  const video = output("video", "video", { id: "o-video", path: "video.mp4" });
  const thumbnails = [2, 1].map((index) =>
    output("thumbnail", "thumbnail", {
      id: `o-thumb-${String(index)}`,
      path: `thumbnail-${String(index)}.png`,
      meta: { index },
    }),
  );
  const { props: given } = props([video, ...thumbnails]);
  renderRouted(<VideoBody {...given} stage={stage("video", "done")} />, testDeps({}));
  const player = await screen.findByLabelText("Generated video", { selector: "video" });
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

it("plays the video from a passage the captions left out when its time is pressed", async () => {
  const video = output("video", "video", {
    id: "o-video",
    path: "video.mp4",
    meta: { subtitleOmissions: [{ start: 75, text: "A line the aligner lost." }] },
  });
  const { props: given } = props([video]);
  renderRouted(<VideoBody {...given} stage={stage("video", "done")} />, testDeps({}));
  const player = await screen.findByLabelText("Generated video", { selector: "video" });
  if (!(player instanceof HTMLVideoElement)) throw new Error("Expected the video element.");
  stubMedia(player);
  await userEvent.click(screen.getByText("Passages left out of the captions"));
  await userEvent.click(screen.getByRole("button", { name: "Play from 1:15" }));
  expect(player.currentTime).toBe(75);
});

it("leads an audiobook with its chaptered file, the video beside it and the other format quiet", async () => {
  const video = output("video", "video", { id: "o-video", path: "video.mp4" });
  const m4b = output("audio_m4b", "video", { id: "o-m4b", path: "audiobook.m4b" });
  const mp3 = output("audio_mp3", "video", { id: "o-mp3", path: "narration.mp3" });
  const { props: given } = props([video, m4b, mp3]);
  const book = {
    ...given.project,
    config: { ...given.project.config, voices: defaultVoicesSettings("audiobook") },
  };
  renderRouted(
    <VideoBody {...given} project={book} stage={stage("video", "done")} />,
    testDeps({}),
  );
  const links = (await screen.findAllByRole("link", { name: /^Download/ })).map(
    (one) => one.textContent,
  );
  expect(links.slice(0, 2)).toEqual(["Download audiobook (.m4b)", "Download video (.mp4)"]);
  expect(
    screen.getByRole("link", { name: "Download audio with chapters (.mp3)" }).textContent,
  ).toBe(".mp3 with chapters");
  // Neither is a menu: each names the one file it fetches.
  expect(screen.queryByRole("button", { name: /^Download/ })).toBeNull();
});

it("says once, under the download, that the video is the previous one while it is made again", async () => {
  const video = output("video", "video", { id: "o-video", path: "video.mp4" });
  const { props: given } = props([video]);
  const base = revisionView();
  const view = {
    ...base,
    outputs: [
      {
        recordId: "rec-video",
        publicationId: null,
        selected: true,
        available: true,
        slot: "export:video",
        workKey: "export:video",
        assetId: video.id,
        output: video,
        fingerprint: "video",
        state: "outdated" as const,
      },
    ],
  };
  renderRouted(
    <RevisionMedia projectId="p1" revisionId="r1">
      <VideoBody {...given} stage={stage("video", "running")} />
    </RevisionMedia>,
    testDeps({ "GET /api/projects/p1/revisions/r1": jsonAnswer({ view }) }),
  );
  // The button keeps its plain name, so it fits the side column; the line under it says it.
  expect(await screen.findByRole("link", { name: "Download video (.mp4)" })).not.toBeNull();
  expect(screen.queryByText(/\(previous version\)/)).toBeNull();
  expect(
    screen.getByText(
      "Being made again: the download is the current file until the new one is ready.",
    ),
  ).not.toBeNull();
  // Nobody changed anything: it does not say "your last change".
  expect(screen.queryByText(/your last change/)).toBeNull();
});
