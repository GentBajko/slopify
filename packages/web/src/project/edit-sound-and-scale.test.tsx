import type { RevisionEdit } from "@app/slices/revisions/model.js";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CastMember } from "@/channels/api";
import { renderApp, testDeps } from "@/test-app";
import { editPreviewImageOf } from "./edit-preview-image.js";
import { EditAmbientBed, EditImageScale } from "./edit-sound-and-scale.js";
import { revisionView } from "./revision-fixture.js";

afterEach(cleanup);

function editOf(over: Partial<RevisionEdit["config"]> = {}): RevisionEdit {
  const view = revisionView();
  return {
    config: {
      ...view.revision.config,
      sources: { ...view.revision.config.sources, images: "generate", audio: "generate" },
      imagePrompts: [{ name: "Castle", number: 2 }],
      ...over,
    },
    content: { ...view.revision.content, articleMarkdown: "word ".repeat(9000) },
  };
}

describe("Edit project's ambient sound", () => {
  it("adds a built-in bed with its defaults, and None takes it away again", async () => {
    const user = userEvent.setup();
    const changed = vi.fn();
    const edit = editOf();
    renderApp(
      <EditAmbientBed edit={edit} problem={() => undefined} onChange={changed} />,
      testDeps({}),
    );
    await user.selectOptions(screen.getByLabelText("Ambient sound"), "rain");
    expect(changed).toHaveBeenLastCalledWith({
      ...edit,
      config: {
        ...edit.config,
        ambientBed: { source: "rain", levelDb: -18, fadeInSeconds: 3, tailSeconds: 6 },
      },
    });
    await user.selectOptions(screen.getByLabelText("Ambient sound"), "");
    expect(changed.mock.lastCall?.[0].config.ambientBed).toBeUndefined();
  });

  it("offers a project's own uploaded bed only while it has one", () => {
    renderApp(
      <EditAmbientBed
        edit={editOf({
          ambientBed: { source: "upload", levelDb: -18, fadeInSeconds: 3, tailSeconds: 6 },
        })}
        problem={() => undefined}
        onChange={() => undefined}
      />,
      testDeps({}),
    );
    expect(screen.getByRole("option", { name: "My own file" })).not.toBeNull();
  });
});

describe("Edit project's More images for long videos", () => {
  it("plans the rate for the article's length and says how many images it makes", async () => {
    const user = userEvent.setup();
    const changed = vi.fn();
    renderApp(
      <EditImageScale edit={editOf()} problem={() => undefined} onChange={changed} />,
      testDeps({}),
    );
    await user.click(screen.getByRole("switch", { name: "More images for long videos" }));
    // Every two minutes of an hour's narration (9,000 words) is 30 images per hour.
    expect(changed.mock.lastCall?.[0].config).toMatchObject({
      imageScale: { perHour: 30, words: 9000 },
      motionStyle: "mixed",
    });
  });

  it("keeps the last good rate while an out-of-range one is typed, and says why", async () => {
    const user = userEvent.setup();
    const changed = vi.fn();
    renderApp(
      <EditImageScale
        edit={editOf({ imageScale: { perHour: 30, words: 9000 } })}
        problem={() => undefined}
        onChange={changed}
      />,
      testDeps({}),
    );
    const input = screen.getByRole("textbox", { name: "Minutes per image" });
    await user.clear(input);
    await user.type(input, "999");
    // "9" was a good rate on the way to "999"; nothing after it reached the draft.
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed.mock.lastCall?.[0].config.imageScale).toEqual({ perHour: 6.6667, words: 9000 });
    expect(screen.getByText(/Enter a number of minutes between/)).not.toBeNull();
  });
});

describe("Edit project's style preview picture", () => {
  const member = (name: string, sha256: string | null): CastMember =>
    ({
      id: name,
      name,
      aliases: [],
      images: [{ id: `${name}-i`, state: sha256 === null ? "generating" : "ready", sha256 }],
    }) as unknown as CastMember;

  it("draws on the establishing image the project has", () => {
    const view = revisionView();
    const withReference = {
      ...view,
      outputs: [
        {
          recordId: "rec",
          publicationId: null,
          selected: true,
          available: true,
          slot: "reference",
          workKey: "reference",
          assetId: "a",
          fingerprint: "f",
          state: "ready" as const,
          output: { id: "o-ref", role: "reference" } as never,
        },
      ],
    };
    const edit = editOf({ reference: { source: "prompt" } as never });
    expect(editPreviewImageOf(withReference, edit, [])).toEqual({
      image: { kind: "output", outputId: "o-ref" },
      drawnOn: "the establishing image",
    });
  });

  it("else on the picture of the cast member the title names", () => {
    const edit = editOf({ title: "The tale of Mira" });
    const drawn = editPreviewImageOf(revisionView(), edit, [
      member("Owen", "a".repeat(64)),
      member("Mira", "b".repeat(64)),
    ]);
    expect(drawn).toEqual({
      image: { kind: "picture", sha256: "b".repeat(64) },
      drawnOn: "Mira's picture",
    });
    expect(editPreviewImageOf(revisionView(), edit, [member("Owen", null)])).toBeUndefined();
  });
});
