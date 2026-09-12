import type {
  RevisionEdit,
  RevisionOutputView,
  RevisionView,
} from "@app/slices/revisions/model.js";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { renderApp, testDeps } from "@/test-app";
import { ImageEditor } from "./image-editor.js";
import { revisionView } from "./revision-fixture.js";
import { formOfRevision } from "./revision-form-state.js";

afterEach(cleanup);
function output(
  key: string,
  assetId: string,
  patch: Partial<RevisionOutputView> = {},
): RevisionOutputView {
  return {
    recordId: `record-${assetId}`,
    publicationId: null,
    selected: true,
    slot: `image:${key}`,
    workKey: `image:${key}`,
    assetId,
    fingerprint: "fp",
    state: "ready",
    available: true,
    output: {
      id: `output-${assetId}`,
      projectId: "p1",
      stageKind: "images",
      role: "image",
      path: `assets/${assetId}/image.png`,
      originalFilename: null,
      bytes: 4,
      durationMs: null,
      meta: {},
      createdAt: "2026-09-12T00:00:00.000Z",
    },
    ...patch,
  };
}
function generated(outputs: readonly RevisionOutputView[]): RevisionView {
  const base = revisionView();
  return {
    ...base,
    outputs,
    revision: {
      ...base.revision,
      config: {
        ...base.revision.config,
        sources: { ...base.revision.config.sources, images: "generate" },
      },
      content: {
        ...base.revision.content,
        imageOrder: ["one", "two"],
        imageDefinitions: {
          one: { source: "generate", assetId: null, prompt: "One" },
          two: { source: "generate", assetId: null, prompt: "Two" },
        },
      },
    },
  };
}
function Harness({
  view,
  initial = formOfRevision(view),
}: {
  readonly view: RevisionView;
  readonly initial?: RevisionEdit;
}) {
  const [edit, setEdit] = useState(initial);
  return <ImageEditor view={view} edit={edit} onChange={setEdit} onPending={() => {}} />;
}
function src(index: number): string | null {
  return within(screen.getByRole("group", { name: `Image ${index}` }))
    .getByRole("img")
    .getAttribute("src");
}
it("previews fresh generated outputs by stable key and keeps them with a reordered scene", async () => {
  const user = userEvent.setup();
  renderApp(
    <Harness view={generated([output("one", "first"), output("two", "second")])} />,
    testDeps({}),
  );
  expect(src(1)).toContain("/record-first");
  expect(src(2)).toContain("/record-second");
  expect(screen.queryByText("No completed image yet")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Move image 2 earlier" }));
  expect(src(1)).toContain("/record-second");
  expect(src(2)).toContain("/record-first");
});
it("prefers the selected regenerated output to an immutable adopted asset reference", () => {
  const view = generated([
    output("one", "old", { selected: false, state: "outdated" }),
    output("one", "new"),
  ]);
  const edit = formOfRevision(view);
  renderApp(
    <Harness
      view={view}
      initial={{
        ...edit,
        content: {
          ...edit.content,
          imageDefinitions: {
            ...edit.content.imageDefinitions,
            one: { source: "generate", assetId: "old", prompt: "One" },
          },
        },
      }}
    />,
    testDeps({}),
  );
  expect(src(1)).toContain("/record-new");
});
it("keeps a selected outdated scene visible with an accurate status", () => {
  renderApp(
    <Harness view={generated([output("one", "old", { state: "outdated" })])} />,
    testDeps({}),
  );
  expect(src(1)).toContain("/record-old");
  expect(screen.getByText("Outdated image retained until rebuilt")).toBeTruthy();
});
it("does not fall back to an unselected old image when the selected file is missing", () => {
  renderApp(
    <Harness
      view={generated([
        output("one", "old", { selected: false }),
        output("one", "missing", { available: false }),
      ])}
    />,
    testDeps({}),
  );
  expect(screen.queryAllByRole("img")).toHaveLength(0);
  expect(screen.getByText("Image file unavailable")).toBeTruthy();
});
it("uses the explicit provided draft reference, including a retained image from another scene", () => {
  const view = generated([
    output("one", "generated"),
    output("two", "provided", { selected: false }),
  ]);
  const edit = formOfRevision(view);
  renderApp(
    <Harness
      view={view}
      initial={{
        ...edit,
        content: {
          ...edit.content,
          imageDefinitions: {
            ...edit.content.imageDefinitions,
            one: { source: "provide", assetId: "provided", prompt: null },
          },
        },
      }}
    />,
    testDeps({}),
  );
  expect(src(1)).toContain("/record-provided");
});
it("does not substitute a generated scene for an unavailable provided draft reference", () => {
  const view = generated([output("one", "generated")]);
  const edit = formOfRevision(view);
  renderApp(
    <Harness
      view={view}
      initial={{
        ...edit,
        content: {
          ...edit.content,
          imageDefinitions: {
            ...edit.content.imageDefinitions,
            one: { source: "provide", assetId: "absent", prompt: null },
          },
        },
      }}
    />,
    testDeps({}),
  );
  expect(screen.queryAllByRole("img")).toHaveLength(0);
  expect(screen.getByText("Image file unavailable")).toBeTruthy();
});
it("labels a staged replacement honestly and keeps the selected old scene until Save", () => {
  const view = generated([output("one", "current")]);
  const edit = formOfRevision(view);
  renderApp(
    <Harness
      view={view}
      initial={{
        ...edit,
        uploads: [{ stagedFileId: "upload", destination: { kind: "image", imageKey: "one" } }],
        content: {
          ...edit.content,
          imageDefinitions: {
            ...edit.content.imageDefinitions,
            one: { source: "provide", assetId: null, prompt: null },
          },
        },
      }}
    />,
    testDeps({}),
  );
  expect(src(1)).toContain("/record-current");
  expect(
    screen.getByText("Replacement ready to save; previous image shown until Save"),
  ).toBeTruthy();
});
it("never renders image prompt records or another scene as a generated preview", () => {
  const wrongRole = output("one", "text");
  renderApp(
    <Harness
      view={generated([
        {
          ...wrongRole,
          output: { ...wrongRole.output, stageKind: "thumbnail", role: "thumbnail" },
        },
        output("another", "unrelated"),
      ])}
    />,
    testDeps({}),
  );
  expect(screen.queryAllByRole("img")).toHaveLength(0);
});
it("does not invent a file URL for a newly staged image without a retained scene", () => {
  const view = generated([]);
  const edit = formOfRevision(view);
  renderApp(
    <Harness
      view={view}
      initial={{
        ...edit,
        uploads: [{ stagedFileId: "upload", destination: { kind: "image", imageKey: "one" } }],
        content: {
          ...edit.content,
          imageDefinitions: {
            ...edit.content.imageDefinitions,
            one: { source: "provide", assetId: null, prompt: null },
          },
        },
      }}
    />,
    testDeps({}),
  );
  expect(screen.queryAllByRole("img")).toHaveLength(0);
  expect(screen.getByText("Replacement ready to save; preview available after Save")).toBeTruthy();
});
it("identifies a provided image awaiting dependency review", () => {
  const view = generated([
    output("one", "provided", { selected: false, recordId: "earlier-binding" }),
    output("one", "provided", { state: "review" }),
  ]);
  const edit = formOfRevision(view);
  renderApp(
    <Harness
      view={view}
      initial={{
        ...edit,
        content: {
          ...edit.content,
          imageDefinitions: {
            ...edit.content.imageDefinitions,
            one: { source: "provide", assetId: "provided", prompt: null },
          },
        },
      }}
    />,
    testDeps({}),
  );
  expect(src(1)).toContain("/record-provided");
  expect(screen.getByText("Image retained; review required")).toBeTruthy();
});
it("rejects a provided reference whose only descriptor belongs to another media role", () => {
  const audio = output("one", "audio");
  const view = generated([
    { ...audio, output: { ...audio.output, role: "audio_body", stageKind: "audio" } },
  ]);
  const edit = formOfRevision(view);
  renderApp(
    <Harness
      view={view}
      initial={{
        ...edit,
        content: {
          ...edit.content,
          imageDefinitions: {
            ...edit.content.imageDefinitions,
            one: { source: "provide", assetId: "audio", prompt: null },
          },
        },
      }}
    />,
    testDeps({}),
  );
  expect(screen.queryAllByRole("img")).toHaveLength(0);
  expect(screen.getByText("Image file unavailable")).toBeTruthy();
});
