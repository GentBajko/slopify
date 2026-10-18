import { describe, expect, it } from "vitest";
import {
  attachedPictures,
  editNote,
  editPictures,
  promptFor,
  referenceNote,
  referencePictures,
  withEditInstruction,
  withReferences,
} from "./reference.js";

const picture = (n: number) => ({ bytes: new Uint8Array([n]), mime: "image/png" as const });
const establishing = picture(1);
const cast = [
  { name: "Cleopatra", description: "last queen of Egypt", images: [picture(2), picture(3)] },
  { name: "Alexandria", description: "", images: [picture(4)] },
];

describe("reference pictures", () => {
  it("attach the establishing image first, then each member's pictures", () => {
    expect(
      referencePictures({ reference: establishing, cast }).map((row) => [
        row.image.bytes[0],
        row.member,
      ]),
    ).toEqual([
      [1, undefined],
      [2, "Cleopatra"],
      [3, "Cleopatra"],
      [4, "Alexandria"],
    ]);
    expect(referencePictures({})).toEqual([]);
  });

  it("keep the wording a request without cast always had", () => {
    expect(withReferences("Brief", { reference: establishing })).toBe(`${referenceNote}\n\nBrief`);
    expect(withReferences("Brief", {})).toBe("Brief");
    expect(withReferences("Brief", { reference: establishing }, 0)).toBe("Brief");
  });

  it("name what each attached picture shows", () => {
    expect(withReferences("Brief", { reference: establishing, cast })).toBe(
      [
        "The attached images are visual references only: do not copy their composition, pose or framing.",
        "Image 1 is the establishing image: keep its characters, rendering style and colour palette.",
        "Image 2 shows Cleopatra (last queen of Egypt): draw Cleopatra to look exactly like this.",
        "Image 3 shows Cleopatra (last queen of Egypt): draw Cleopatra to look exactly like this.",
        "Image 4 shows Alexandria: draw Alexandria to look exactly like this.",
        "Compose a new image from this brief:",
        "",
        "Brief",
      ].join("\n"),
    );
  });

  it("describe in words the members whose pictures a provider can't take", () => {
    expect(withReferences("Brief", { reference: establishing, cast }, 1)).toBe(
      [
        "The attached images are visual references only: do not copy their composition, pose or framing.",
        "Image 1 is the establishing image: keep its characters, rendering style and colour palette.",
        "Cleopatra appears in this image (last queen of Egypt).",
        "Alexandria appears in this image.",
        "Compose a new image from this brief:",
        "",
        "Brief",
      ].join("\n"),
    );
    expect(withReferences("Brief", { cast }, 0)).toBe(
      "Cleopatra appears in this image (last queen of Egypt).\nAlexandria appears in this image.\nCompose a new image from this brief:\n\nBrief",
    );
  });
});

describe("edit pictures", () => {
  const source = picture(9);

  it("attach the picture to change first, then the cast, and never the establishing image", () => {
    expect(
      editPictures({ edit: { source }, cast }).map((row) => [row.image.bytes[0], row.member]),
    ).toEqual([
      [9, undefined],
      [2, "Cleopatra"],
      [3, "Cleopatra"],
      [4, "Alexandria"],
    ]);
    expect(
      attachedPictures({ edit: { source }, reference: establishing }).map((row) => row.image),
    ).toEqual([source]);
  });

  it("say the instruction changes the first picture and keeps the rest", () => {
    expect(withEditInstruction("Darker sky", { edit: { source } })).toBe(
      `${editNote}\n\nDarker sky`,
    );
    expect(withEditInstruction("Put Cleopatra on a stage", { edit: { source }, cast }, 2)).toBe(
      [
        editNote,
        "Image 2 shows Cleopatra (last queen of Egypt): draw Cleopatra to look exactly like this.",
        "Alexandria appears in this image.",
        "",
        "Put Cleopatra on a stage",
      ].join("\n"),
    );
  });

  it("leave a request without an edit exactly as it was", () => {
    for (const req of [
      {},
      { reference: establishing },
      { reference: establishing, cast },
      { cast },
    ])
      for (const limit of [0, 1, Number.POSITIVE_INFINITY]) {
        expect(attachedPictures(req)).toEqual(referencePictures(req));
        expect(promptFor("Brief", req, limit)).toBe(withReferences("Brief", req, limit));
      }
    expect(promptFor("Darker", { edit: { source } })).toBe(`${editNote}\n\nDarker`);
  });
});
