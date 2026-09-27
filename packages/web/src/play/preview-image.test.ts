import type { CastMember } from "@app/slices/channels/model.js";
import { expect, it } from "vitest";
import { previewImageOf } from "./preview-image";
import { freshForm, type PlayFormState } from "./state";

function member(name: string, sha256: string | null, aliases: readonly string[] = []): CastMember {
  return {
    id: `${name}-id`,
    channelId: "c",
    kind: "character",
    name,
    aliases,
    description: "",
    version: 1,
    images:
      sha256 === null
        ? []
        : [
            {
              id: `${name}-picture`,
              source: "upload",
              prompt: null,
              state: "ready",
              error: null,
              sha256,
              createdAt: "",
            },
          ],
    createdAt: "",
    updatedAt: "",
  };
}

const cast = [
  member("Ada", null),
  member("Brom", "b".repeat(64)),
  member("Tiamat", "t".repeat(64), ["the Dragon Queen"]),
];

it("draws on the uploaded establishing image first", () => {
  const form: PlayFormState = {
    ...freshForm,
    sources: { ...freshForm.sources, images: "generate" },
    reference: { source: "provide", prompt: "", thumbnail: true },
    provided: {
      ...freshForm.provided,
      reference: {
        key: "r",
        name: "reference.png",
        error: undefined,
        file: {
          id: "11111111-1111-4111-8111-111111111111",
          stageKind: "images",
          path: "11111111-1111-4111-8111-111111111111",
          originalFilename: "reference.png",
          bytes: 10,
          state: "staged",
          createdAt: "",
        },
      },
    },
  };
  expect(previewImageOf(form, cast)).toEqual({
    image: { kind: "upload", stagedFileId: "11111111-1111-4111-8111-111111111111" },
    drawnOn: "the establishing image",
  });
});

it("draws on the picture of the cast member the title or a keyword names, else the first one", () => {
  expect(
    previewImageOf(
      { ...freshForm, title: "How {{topic}} fell", values: { topic: "the Dragon Queen" } },
      cast,
    ),
  ).toEqual({ image: { kind: "picture", sha256: "t".repeat(64) }, drawnOn: "Tiamat's picture" });
  expect(previewImageOf({ ...freshForm, title: "Nobody" }, cast)?.image).toEqual({
    kind: "picture",
    sha256: "b".repeat(64),
  });
});

it("keeps the sample stills without an establishing image or a pictured cast", () => {
  expect(previewImageOf(freshForm, [member("Ada", null)])).toBeUndefined();
  expect(previewImageOf(freshForm, [])).toBeUndefined();
});
