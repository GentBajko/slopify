import type { Output, OutputRole } from "@app/slices/storage/model.js";
import { describe, expect, it } from "vitest";
import { groupImages } from "./image-groups.js";

function image(promptName: string | undefined, index: number, role: OutputRole = "image"): Output {
  return {
    id: `${promptName ?? "none"}-${String(index)}`,
    projectId: "p1",
    stageKind: "images",
    role,
    path: "image.png",
    originalFilename: null,
    bytes: 10,
    durationMs: null,
    meta: { ...(promptName === undefined ? {} : { promptName }), index },
    createdAt: "2026-09-03T00:00:00.000Z",
  };
}

describe("grouping a run's images for the grid", () => {
  it("keeps the prompts in the order the run picked them", () => {
    const groups = groupImages([image("Maps", 1), image("Oils", 1)], ["Oils", "Maps"]);
    expect(groups.map((group) => group.name)).toEqual(["Oils", "Maps"]);
  });

  it("sorts inside a group by the index, not by the row's age", () => {
    // A regenerated image is a new row at the end of the list, back at its old index.
    const groups = groupImages([image("Oils", 3), image("Oils", 1), image("Oils", 2)], ["Oils"]);
    expect(groups[0]?.images.map((output) => output.meta.index)).toEqual([1, 2, 3]);
  });

  it("keeps a prompt the configuration no longer names, after the ones it does", () => {
    const groups = groupImages([image("Gone", 1), image("Oils", 1)], ["Oils"]);
    expect(groups.map((group) => group.name)).toEqual(["Oils", "Gone"]);
  });

  it("collects images with no prompt name of their own under one heading", () => {
    const groups = groupImages([image(undefined, 2), image(undefined, 1)], []);
    expect(groups).toEqual([
      { name: "Images", images: [image(undefined, 1), image(undefined, 2)] },
    ]);
  });

  it("leaves the thumbnail out, because it is never in the slideshow", () => {
    expect(groupImages([image("Oils", 1, "thumbnail")], ["Oils"])).toEqual([]);
  });

  it("has no groups at all when nothing has landed", () => {
    expect(groupImages([], ["Oils"])).toEqual([]);
  });
});
