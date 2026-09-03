import type { StagedFile } from "@app/slices/storage/model.js";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Answer, jsonAnswer, problemAnswer, renderApp, testDeps } from "@/test-app";
import { draftOf, firstBlocker, PlayForm, type PlayFormState } from "./play.js";

afterEach(cleanup);

function upload(id: string, name: string): Upload {
  return { key: id, name, stagedFileId: id, error: undefined };
}

// The shape play.tsx keeps per picked file. It is not exported, and a test that named it
// through the module would only be restating the module.
interface Upload {
  readonly key: string;
  readonly name: string;
  readonly stagedFileId: string | undefined;
  readonly error: string | undefined;
}

const complete: PlayFormState = {
  title: "Rope Tricks",
  article: "Everything you never wanted to know about rope.",
  audio: upload("a1", "body.mp3"),
  images: [upload("i1", "one.png")],
};

describe("what stands between the form and a run", () => {
  it("passes a complete Provide-only form", () => {
    expect(firstBlocker(complete)).toBeUndefined();
  });

  it("names the article first, because it is the first rail", () => {
    expect(firstBlocker({ ...complete, article: "   ", title: "" })?.hint).toBe(
      "Paste the article to play",
    );
  });

  it("names the audio once the article is there", () => {
    expect(firstBlocker({ ...complete, audio: undefined, title: "" })?.hint).toBe(
      "Attach the narration audio to play",
    );
  });

  it("names the images once the audio is there", () => {
    expect(firstBlocker({ ...complete, images: [], title: "" })?.hint).toBe(
      "Attach at least one image to play",
    );
  });

  it("refuses more images than a run holds", () => {
    const images = Array.from({ length: 61 }, (_ignored, at) => upload(`i${String(at)}`, "x.png"));
    expect(firstBlocker({ ...complete, images })?.hint).toBe(
      "Remove images to play: a run holds at most 60",
    );
  });

  it("waits for an upload that is still copying", () => {
    expect(
      firstBlocker({
        ...complete,
        images: [{ key: "i1", name: "one.png", stagedFileId: undefined, error: undefined }],
      })?.hint,
    ).toBe("Wait for the uploads to finish to play");
  });

  it("points at an upload that failed before it points at a slow one", () => {
    expect(
      firstBlocker({
        ...complete,
        images: [
          { key: "i1", name: "one.png", stagedFileId: undefined, error: undefined },
          { key: "i2", name: "two.png", stagedFileId: undefined, error: "the disk is full" },
        ],
      })?.hint,
    ).toBe("Remove the upload that failed to play");
  });

  it("names the title last, because the cue sheet is read last", () => {
    const blocker = firstBlocker({ ...complete, title: "  " });
    expect(blocker?.hint).toBe("Name the video to play");
    expect(blocker?.field).toBe("title");
  });

  it("refuses a title longer than the column holds", () => {
    expect(firstBlocker({ ...complete, title: "x".repeat(201) })?.hint).toBe(
      "Shorten the title to 200 characters to play",
    );
  });
});

describe("the draft a Provide-only run posts", () => {
  it("marks research and thumbnail off and keeps the slideshow in pick order", () => {
    const draft = draftOf(
      { ...complete, images: [upload("i1", "one.png"), upload("i2", "two.png")] },
      "9:16",
    );
    expect(draft.sources).toEqual({
      research: "off",
      article: "provide",
      audio: "provide",
      images: "provide",
      thumbnail: "off",
      video: "generate",
    });
    expect(draft.provided.images).toEqual(["i1", "i2"]);
    expect(draft.provided.audio).toBe("a1");
    expect(draft.format).toBe("9:16");
    expect(draft.title).toBe("Rope Tricks");
    expect(draft.silenceGapSeconds).toBe(3);
  });
});

function staged(id: string, name: string): Answer {
  const file: StagedFile = {
    id,
    stageKind: name.endsWith(".mp3") ? "audio" : "images",
    path: id,
    originalFilename: name,
    bytes: 4,
    state: "staged",
    createdAt: "2026-09-03T00:00:00.000Z",
  };
  return jsonAnswer(file, 201);
}

function playRoutes(): Readonly<Record<string, Answer>> {
  return {
    "POST /api/staging/audio": staged("a1", "body.mp3"),
    "POST /api/staging/images": staged("i1", "one.png"),
    "POST /api/projects": jsonAnswer({ project: { id: "p1", status: "running" }, stages: [] }, 201),
  };
}

function playKey(): HTMLButtonElement {
  return screen.getByRole("button", { name: /PLAY/ });
}

describe("the Play key", () => {
  it("is disabled on a fresh form and names the first missing item", () => {
    renderApp(<PlayForm onCreated={vi.fn()} />, testDeps(playRoutes()));

    expect(playKey().disabled).toBe(true);
    expect(screen.getByText("Paste the article to play")).not.toBeNull();
  });

  it("moves the hint to the next missing item as the form fills", async () => {
    renderApp(<PlayForm onCreated={vi.fn()} />, testDeps(playRoutes()));

    await userEvent.type(screen.getByLabelText("Article text"), "Rope, at length.");

    expect(screen.getByText("Attach the narration audio to play")).not.toBeNull();
    expect(playKey().disabled).toBe(true);
  });

  it("comes alive only once every stage is provided and the run is named", async () => {
    const created = vi.fn();
    renderApp(<PlayForm onCreated={created} />, testDeps(playRoutes()));

    await userEvent.type(screen.getByLabelText("Article text"), "Rope, at length.");
    await userEvent.upload(
      screen.getByLabelText("Narration file"),
      new File(["snd"], "body.mp3", { type: "audio/mpeg" }),
    );
    await userEvent.upload(
      screen.getByLabelText("Slideshow images"),
      new File(["png"], "one.png", { type: "image/png" }),
    );
    await waitFor(() => {
      expect(screen.getByText("Name the video to play")).not.toBeNull();
    });

    await userEvent.type(screen.getByLabelText("Video title"), "Rope Tricks");

    await waitFor(() => {
      expect(playKey().disabled).toBe(false);
    });
    expect(screen.queryByText(/to play$/)).toBeNull();

    await userEvent.click(playKey());
    await waitFor(() => {
      expect(created).toHaveBeenCalledWith("p1");
    });
  });

  it("keeps the form and shows the problem when the run is refused", async () => {
    renderApp(
      <PlayForm onCreated={vi.fn()} />,
      testDeps({
        ...playRoutes(),
        "POST /api/projects": problemAnswer("This run cannot start yet.", 400),
      }),
    );

    await userEvent.type(screen.getByLabelText("Article text"), "Rope, at length.");
    await userEvent.upload(
      screen.getByLabelText("Narration file"),
      new File(["snd"], "body.mp3", { type: "audio/mpeg" }),
    );
    await userEvent.upload(
      screen.getByLabelText("Slideshow images"),
      new File(["png"], "one.png", { type: "image/png" }),
    );
    await userEvent.type(screen.getByLabelText("Video title"), "Rope Tricks");
    await waitFor(() => {
      expect(playKey().disabled).toBe(false);
    });
    await userEvent.click(playKey());

    expect(await screen.findByText("This run cannot start yet.")).not.toBeNull();
    expect((screen.getByLabelText("Video title") as HTMLInputElement).value).toBe("Rope Tricks");
  });

  it("shows a failed upload in place and blocks the run", async () => {
    renderApp(
      <PlayForm onCreated={vi.fn()} />,
      testDeps({
        ...playRoutes(),
        "POST /api/staging/audio": problemAnswer("The uploaded file is empty.", 400),
      }),
    );

    await userEvent.type(screen.getByLabelText("Article text"), "Rope, at length.");
    await userEvent.upload(
      screen.getByLabelText("Narration file"),
      new File(["snd"], "body.mp3", { type: "audio/mpeg" }),
    );

    expect(await screen.findByText("The uploaded file is empty.")).not.toBeNull();
    expect(playKey().disabled).toBe(true);
  });
});
