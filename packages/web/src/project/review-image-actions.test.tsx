import type { RevisionView } from "@app/slices/revisions/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { output } from "@/routes/project-fixtures";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { ClipAudition } from "./review-clip-audition.js";
import { ImageReviewActions } from "./review-image-actions.js";
import { YouTubePreview } from "./review-youtube-preview.js";
import { EditRequestContext } from "./revision-action-context.js";
import { revisionView } from "./revision-fixture.js";
import { RevisionMedia } from "./revision-media.js";

afterEach(cleanup);

function viewWith(id: string, parentId: string | null, image: Output): RevisionView {
  const base = revisionView(id);
  return {
    ...base,
    revision: { ...base.revision, parentId },
    outputs: [
      {
        recordId: `${id}-${image.id}`,
        publicationId: null,
        selected: true,
        available: true,
        slot: "image:k1",
        workKey: "image:k1",
        assetId: image.id,
        output: image,
        fingerprint: image.id,
        state: "ready",
      },
    ],
  };
}

const now = output("image", "images", { id: "o-new", meta: { index: 1, prompt: "A red door" } });
const before = output("image", "images", { id: "o-old", meta: { index: 1, prompt: "A door" } });

function mount(requestEdit = vi.fn()) {
  renderApp(
    <RevisionMedia projectId="p1" revisionId="r2">
      <EditRequestContext value={requestEdit}>
        <ImageReviewActions
          output={now}
          name="image 1"
          aspect="landscape"
          replaceable
          disabled={false}
        />
      </EditRequestContext>
    </RevisionMedia>,
    testDeps({
      "GET /api/projects/p1/revisions/r2": jsonAnswer({ view: viewWith("r2", "r1", now) }),
      "GET /api/projects/p1/revisions/r1": jsonAnswer({ view: viewWith("r1", null, before) }),
    }),
  );
  return requestEdit;
}

it("shows an image beside the version it replaced, each with its prompt", async () => {
  mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Compare image 1 with its previous version" }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Image 1: before and now" });
  expect(await within(dialog).findByText("Prompt: A door")).toBeDefined();
  expect(within(dialog).getByText("Prompt: A red door")).toBeDefined();
  expect(within(dialog).getByAltText("Image 1, previous version")).toBeDefined();
});

it("opens Edit project at the image to replace it with a file", async () => {
  const requestEdit = mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Replace image 1 with my file" }),
  );
  expect(requestEdit).toHaveBeenCalledWith(expect.objectContaining({ section: "images" }));
});

it("opens Edit project at a drawn thumbnail's own field to replace it with a file", async () => {
  const thumbnail = output("thumbnail", "thumbnail", { id: "o-t2", meta: { index: 2 } });
  const base = revisionView("r2");
  const view: RevisionView = {
    ...base,
    outputs: [
      {
        recordId: "r2-o-t2",
        publicationId: null,
        selected: true,
        available: true,
        slot: "thumbnail:image:2",
        workKey: "thumbnail:image:2",
        assetId: thumbnail.id,
        output: thumbnail,
        fingerprint: thumbnail.id,
        state: "ready",
      },
    ],
  };
  const requestEdit = vi.fn();
  renderApp(
    <RevisionMedia projectId="p1" revisionId="r2">
      <EditRequestContext value={requestEdit}>
        <ImageReviewActions
          output={thumbnail}
          name="thumbnail 2"
          aspect="landscape"
          replaceable
          disabled={false}
        />
      </EditRequestContext>
    </RevisionMedia>,
    testDeps({ "GET /api/projects/p1/revisions/r2": jsonAnswer({ view }) }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Replace thumbnail 2 with my file" }),
  );
  expect(requestEdit).toHaveBeenCalledWith(expect.objectContaining({ section: "images" }));
});

it("plays a short's clip, and its last seconds, from the finished video", async () => {
  const play = vi.fn();
  renderApp(
    <ClipAudition
      audition={{ element: null, play, stop: () => {}, playing: undefined }}
      clip={{ number: 2, start: 30, end: 90 }}
    />,
    testDeps({}),
  );
  await userEvent.click(screen.getByRole("button", { name: "Play short 2" }));
  expect(play).toHaveBeenCalledWith(30, 90, "short-2");
  await userEvent.click(screen.getByRole("button", { name: "Hear the ending of short 2" }));
  expect(play).toHaveBeenLastCalledWith(84, 90, "short-2-end");
});

it("shows a thumbnail the size YouTube shows it, with the length and title, and flags one too big for Studio", async () => {
  const big = output("thumbnail", "thumbnail", {
    id: "o-thumb",
    bytes: 60 * 1024 * 1024,
    meta: { index: 1 },
  });
  renderApp(
    <YouTubePreview
      thumbnails={[big]}
      title="Why rope holds"
      durationMs={754_000}
      portrait={false}
    />,
    testDeps({}),
  );
  await userEvent.click(screen.getByText("See it as YouTube shows it"));
  expect(screen.getAllByText("Why rope holds")).toHaveLength(2);
  expect(screen.getAllByText("12:34")).toHaveLength(2);
  expect(screen.getByRole("alert").textContent).toContain("up to 50 MB");
});
