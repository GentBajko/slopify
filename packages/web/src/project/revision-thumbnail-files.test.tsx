import type { RevisionEdit } from "@app/slices/revisions/model.js";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderApp, testDeps } from "@/test-app";
import { imageEdit, response, staged } from "./revision-editor-test-fixtures.js";
import { ThumbnailFiles } from "./revision-thumbnail-files.js";

afterEach(cleanup);

function threeThumbnails(): RevisionEdit {
  const edit = imageEdit();
  return {
    ...edit,
    config: {
      ...edit.config,
      sources: { ...edit.config.sources, thumbnail: "from_prompt" },
      thumbnailCount: 3,
    },
  };
}

function mount(edit: RevisionEdit, bytes: number) {
  const changed = vi.fn();
  renderApp(
    <ThumbnailFiles edit={edit} getEdit={() => edit} onChange={changed} onPending={() => {}} />,
    testDeps({
      "POST /api/staging/thumbnail": () =>
        response({ ...staged, id: "mine", stageKind: "thumbnail", bytes }),
    }),
  );
  return changed;
}

async function choose(label: string): Promise<void> {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(label), {
      target: { files: [new File(["png"], "mine.png", { type: "image/png" })] },
    });
  });
}

it("puts a chosen file in place of one drawn thumbnail", async () => {
  const changed = mount(threeThumbnails(), 3);
  expect(screen.getByLabelText("Replace thumbnail 1 with my file")).not.toBeNull();
  expect(screen.getByLabelText("Replace thumbnail 3 with my file")).not.toBeNull();
  await choose("Replace thumbnail 2 with my file");
  await vi.waitFor(() =>
    expect(changed).toHaveBeenCalledWith(
      expect.objectContaining({
        uploads: [{ stagedFileId: "mine", destination: { kind: "thumbnail", variant: 2 } }],
      }),
    ),
  );
});

it("refuses a file larger than YouTube Studio takes, and says where to choose again", async () => {
  const changed = mount(threeThumbnails(), 60 * 1024 * 1024);
  await choose("Replace thumbnail 1 with my file");
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("up to 50 MB");
  expect(alert.textContent).toContain("Replace thumbnail 1 with my file");
  expect(changed).not.toHaveBeenCalled();
});

it("offers nothing when the thumbnail is uploaded rather than drawn", () => {
  const edit = imageEdit();
  mount(
    {
      ...edit,
      config: { ...edit.config, sources: { ...edit.config.sources, thumbnail: "provide" } },
    },
    3,
  );
  expect(screen.queryByLabelText(/with my file/)).toBeNull();
});
