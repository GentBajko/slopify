import type { RevisionEdit } from "@app/slices/revisions/model.js";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { emptyAnswer, jsonAnswer, renderApp, testDeps } from "@/test-app";
import { ImageEditor } from "./image-editor.js";
import { deferred, imageEdit, response, staged } from "./revision-editor-test-fixtures.js";
import { revisionView } from "./revision-fixture.js";
import { formOfRevision } from "./revision-form-state.js";

afterEach(cleanup);
it("moves stable keys without changing asset identity", async () => {
  const user = userEvent.setup();
  const changed = vi.fn();
  const base = formOfRevision(revisionView());
  const edit = {
    ...base,
    config: { ...base.config, sources: { ...base.config.sources, images: "provide" as const } },
    content: {
      ...base.content,
      imageOrder: ["i1", "i2"],
      imageDefinitions: {
        i1: { source: "provide" as const, assetId: "a1", prompt: null },
        i2: { source: "provide" as const, assetId: "a2", prompt: null },
      },
    },
  };
  renderApp(<ImageEditor edit={edit} onChange={changed} onPending={() => {}} />, testDeps({}));
  await user.click(screen.getByRole("button", { name: "Move image 2 earlier" }));
  expect(changed).toHaveBeenCalledWith({
    ...edit,
    content: { ...edit.content, imageOrder: ["i2", "i1"] },
  });
});

function Harness({
  initial = imageEdit(),
  changed = () => {},
}: {
  readonly initial?: RevisionEdit;
  readonly changed?: (edit: RevisionEdit) => void;
}) {
  const [edit, setEdit] = useState(initial);
  return (
    <>
      <button
        type="button"
        onClick={() => setEdit({ ...edit, config: { ...edit.config, title: "New title" } })}
      >
        Change title
      </button>
      <button
        type="button"
        onClick={() =>
          setEdit({
            ...edit,
            config: {
              ...edit.config,
              sources: { ...edit.config.sources, images: "off", video: "off" },
            },
          })
        }
      >
        Turn Images Off
      </button>
      <ImageEditor
        edit={edit}
        onChange={(next) => {
          changed(next);
          setEdit(next);
        }}
        onPending={() => {}}
      />
      <output>{JSON.stringify(edit)}</output>
    </>
  );
}
it("does not adopt lost raw wording until explicitly chosen and deduplicates regeneration", async () => {
  const user = userEvent.setup();
  const changed = vi.fn();
  renderApp(<Harness changed={changed} />, testDeps({}));
  expect(changed).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Use saved wording as template for image 1" }),
  );
  expect(changed.mock.lastCall?.[0].content.promptTemplates["image:i1"]).toBe("Saved scene");
  await user.click(screen.getByRole("button", { name: "Regenerate image 1 after review" }));
  await user.click(screen.getByRole("button", { name: "Regenerate image 1 after review" }));
  expect(changed.mock.lastCall?.[0].regenerate).toEqual(["image:i1"]);
});
it("keeps replacement identity and latest unrelated edits after real staging completes", async () => {
  const user = userEvent.setup();
  const copied = deferred<Response>();
  const changed = vi.fn();
  renderApp(
    <Harness initial={{ ...imageEdit(), regenerate: ["image:i1"] }} changed={changed} />,
    testDeps({ "POST /api/staging/images": () => copied.promise }),
  );
  fireEvent.change(screen.getByLabelText("Replace image 1"), {
    target: { files: [new File(["png"], "scene.png", { type: "image/png" })] },
  });
  await user.click(screen.getByRole("button", { name: "Change title" }));
  copied.resolve(response(staged));
  await waitFor(() => expect(changed.mock.lastCall?.[0].uploads).toHaveLength(1));
  const result = changed.mock.lastCall?.[0];
  expect(result.config.title).toBe("New title");
  expect(result.content.imageOrder).toEqual(["i1", "i2"]);
  expect(result.content.imageDefinitions.i1).toEqual({
    source: "provide",
    assetId: "a1",
    prompt: null,
    templateKey: null,
  });
  expect(result.uploads).toEqual([
    { stagedFileId: "upload1", destination: { kind: "image", imageKey: "i1" } },
  ]);
  expect(result.regenerate).toEqual([]);
});
it("deletes an uploading last image without resurrecting it, clears intents and disables video", async () => {
  const user = userEvent.setup();
  const copied = deferred<Response>();
  const removed = vi.fn(emptyAnswer());
  const changed = vi.fn();
  const base = imageEdit();
  renderApp(
    <Harness
      initial={{
        ...base,
        regenerate: ["image:i1"],
        uploads: [{ stagedFileId: "old", destination: { kind: "image", imageKey: "i1" } }],
        content: {
          ...base.content,
          imageOrder: ["i1"],
          imageDefinitions: {
            i1: base.content.imageDefinitions.i1 ?? {
              source: "generate",
              assetId: null,
              prompt: "scene",
            },
          },
        },
      }}
      changed={changed}
    />,
    testDeps({
      "POST /api/staging/images": () => copied.promise,
      "DELETE /api/staging/upload1": removed,
    }),
  );
  fireEvent.change(screen.getByLabelText("Replace image 1"), {
    target: { files: [new File(["png"], "scene.png", { type: "image/png" })] },
  });
  await user.click(
    screen.getByRole("button", { name: "Delete image 1 and turn Images and Video Off" }),
  );
  copied.resolve(response(staged));
  await waitFor(() => expect(removed).toHaveBeenCalledTimes(1));
  const result = changed.mock.lastCall?.[0];
  expect(result.config.sources.images).toBe("off");
  expect(result.config.sources.video).toBe("off");
  expect(result.content.imageOrder).toEqual([]);
  expect(result.uploads).toEqual([]);
  expect(result.regenerate).toEqual([]);
  expect(changed).toHaveBeenCalledTimes(1);
});
it("adds generated and actual provided images with separate stable keys", async () => {
  const user = userEvent.setup();
  const changed = vi.fn();
  renderApp(
    <Harness initial={formOfRevision(revisionView())} changed={changed} />,
    testDeps({ "POST /api/staging/images": jsonAnswer(staged, 201) }),
  );
  await user.click(screen.getByRole("button", { name: "Add generated image" }));
  const first = changed.mock.lastCall?.[0].content.imageOrder[0];
  expect(first).toEqual(expect.any(String));
  fireEvent.change(screen.getByLabelText("Add provided image"), {
    target: { files: [new File(["png"], "scene.png", { type: "image/png" })] },
  });
  await waitFor(() => expect(changed.mock.lastCall?.[0].content.imageOrder).toHaveLength(2));
  const next = changed.mock.lastCall?.[0];
  const second = next.content.imageOrder[1];
  expect(second).not.toBe(first);
  expect(next.uploads[0].destination.imageKey).toBe(second);
  expect(next.content.imageDefinitions[second].source).toBe("provide");
  expect(next.config.sources.images).toBe("generate");
});
it("does not offer additions beyond the server's 60 image limit", () => {
  const base = imageEdit();
  const order = Array.from({ length: 60 }, (_, index) => `i${index}`);
  const edit = {
    ...base,
    content: {
      ...base.content,
      imageOrder: order,
      imageDefinitions: Object.fromEntries(
        order.map((key) => [key, { source: "provide" as const, assetId: key, prompt: null }]),
      ),
    },
  };
  renderApp(<ImageEditor edit={edit} onChange={() => {}} onPending={() => {}} />, testDeps({}));
  expect(
    (screen.getByRole("button", { name: "Add generated image" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(screen.queryByLabelText("Add provided image")).toBeNull();
});
it("lets a newer prompt edit cancel a pending image replacement", async () => {
  const user = userEvent.setup();
  const copied = deferred<Response>();
  const removed = vi.fn(emptyAnswer());
  const changed = vi.fn();
  renderApp(
    <Harness changed={changed} />,
    testDeps({
      "POST /api/staging/images": () => copied.promise,
      "DELETE /api/staging/upload1": removed,
    }),
  );
  fireEvent.change(screen.getByLabelText("Replace image 1"), {
    target: { files: [new File(["png"], "scene.png", { type: "image/png" })] },
  });
  await user.clear(screen.getByRole("textbox", { name: "Prompt for image 1" }));
  await user.type(screen.getByRole("textbox", { name: "Prompt for image 1" }), "New scene");
  copied.resolve(response(staged));
  await waitFor(() => expect(removed).toHaveBeenCalledTimes(1));
  expect(changed.mock.lastCall?.[0].content.imageDefinitions.i1).toEqual({
    source: "generate",
    assetId: "a1",
    templateKey: "image:i1",
    prompt: "New scene",
  });
  expect(changed.mock.lastCall?.[0].uploads).toBeUndefined();
});
it("cancels an added upload when Images is explicitly turned Off during copying", async () => {
  const user = userEvent.setup();
  const copied = deferred<Response>();
  const removed = vi.fn(emptyAnswer());
  const changed = vi.fn();
  renderApp(
    <Harness changed={changed} />,
    testDeps({
      "POST /api/staging/images": () => copied.promise,
      "DELETE /api/staging/upload1": removed,
    }),
  );
  fireEvent.change(screen.getByLabelText("Add provided image"), {
    target: { files: [new File(["png"], "scene.png", { type: "image/png" })] },
  });
  await user.click(screen.getByRole("button", { name: "Turn Images Off" }));
  copied.resolve(response(staged));
  await waitFor(() => expect(removed).toHaveBeenCalledTimes(1));
  expect(changed).not.toHaveBeenCalled();
  expect(screen.getByRole("status").textContent).toContain('"images":"off"');
});
