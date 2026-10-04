import type { RevisionEdit } from "@app/slices/revisions/model.js";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { renderApp, testDeps } from "@/test-app";
import { ImageEditor } from "./image-editor.js";
import { removeImage, restoreImage } from "./image-removal.js";
import { imageEdit } from "./revision-editor-test-fixtures.js";

afterEach(cleanup);

describe("removeImage and restoreImage", () => {
  it("puts a deleted image back in its place with its staged file and Regenerate mark", () => {
    const edit: RevisionEdit = {
      ...imageEdit(),
      regenerate: ["image:i1"],
      uploads: [{ stagedFileId: "s1", destination: { kind: "image", imageKey: "i1" } }],
    };
    const { next, removed } = removeImage(edit, "i1");
    expect(next.content.imageOrder).toEqual(["i2"]);
    expect(next.uploads).toEqual([]);
    expect(next.regenerate).toEqual([]);
    if (removed === undefined) throw new Error("Expected the removed image.");
    const back = restoreImage(next, removed);
    expect(back?.content.imageOrder).toEqual(["i1", "i2"]);
    expect(back?.content.imageDefinitions.i1).toEqual(edit.content.imageDefinitions.i1);
    expect(back?.uploads).toEqual(edit.uploads);
    expect(back?.regenerate).toEqual(["image:i1"]);
  });

  it("turns Images and Video back on when the last image comes back", () => {
    const one = removeImage(imageEdit(), "i2").next;
    const { next, removed } = removeImage(one, "i1");
    expect(next.config.sources.images).toBe("off");
    if (removed === undefined) throw new Error("Expected the removed image.");
    const back = restoreImage(next, removed);
    expect(back?.config.sources.images).toBe("generate");
    expect(back?.config.sources.video).toBe("generate");
  });

  it("leaves a draft that already has the image alone", () => {
    const { removed } = removeImage(imageEdit(), "i1");
    if (removed === undefined) throw new Error("Expected the removed image.");
    expect(restoreImage(imageEdit(), removed)).toBeUndefined();
  });
});

function Harness() {
  const [edit, setEdit] = useState(imageEdit());
  return (
    <>
      <ImageEditor edit={edit} onChange={setEdit} onPending={() => {}} />
      <output>{edit.content.imageOrder.join(",")}</output>
    </>
  );
}

it("offers Undo after deleting an image from the draft", async () => {
  const user = userEvent.setup();
  renderApp(<Harness />, testDeps({}));
  await user.click(screen.getByRole("button", { name: "Delete image 1" }));
  expect(screen.getByText(/Image 1 is deleted from this draft/)).toBeTruthy();
  expect(document.querySelector("output")?.textContent).toBe("i2");
  await user.click(screen.getByRole("button", { name: "Undo" }));
  expect(document.querySelector("output")?.textContent).toBe("i1,i2");
  expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
});
