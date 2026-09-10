import { expect, it } from "vitest";
import type { StagePiece } from "../../kernel/runner/piece-repo.js";
import { readyView } from "./recipe-fixture.js";
import { legacyImageOutput, legacyPieceKey } from "./recipe-legacy.js";

it("matches an output written before its image piece receives the file", () => {
  const output = readyView().outputs.find((row) => row.output.role === "image")?.output;
  if (output === undefined) throw new Error("Missing image fixture");
  const matched = { ...output, meta: { index: 2, promptName: "Landscape", prompt: "Coast" } };
  const piece: StagePiece = {
    id: "unfinished",
    stageId: "images",
    kind: "image",
    idx: 2,
    state: "running",
    payload: JSON.stringify({
      promptName: "Landscape",
      prompt: "Coast",
      promptIndex: 1,
      indexInPrompt: 2,
    }),
  };
  expect(legacyImageOutput({ ...piece, kind: "chunk" }, [matched])).toBeUndefined();
  expect(legacyPieceKey(piece, "images", [matched])).toBe(`image:${output.id}`);
  expect(
    legacyPieceKey(piece, "images", [{ ...matched, meta: { ...matched.meta, prompt: "Other" } }]),
  ).toBe("image:unfinished");
  expect(
    legacyPieceKey(piece, "images", [{ ...matched, meta: { ...matched.meta, index: 1 } }]),
  ).toBe("image:unfinished");
  expect(
    legacyPieceKey(piece, "images", [
      { ...matched, meta: { ...matched.meta, promptName: "Other" } },
    ]),
  ).toBe("image:unfinished");
  expect(
    legacyPieceKey(
      {
        ...piece,
        payload: JSON.stringify({
          file: "missing-original.png",
          promptName: "Landscape",
          prompt: "Coast",
        }),
      },
      "images",
      [matched],
    ),
  ).toBe("image:unfinished");
});
it("refuses ambiguous legacy image matches instead of picking the first output", () => {
  const output = readyView().outputs.find((row) => row.output.role === "image")?.output;
  if (output === undefined) throw new Error("Missing image fixture");
  const first = { ...output, meta: { index: 1, promptName: "Landscape", prompt: "Coast" } };
  const second = { ...first, id: "other-output" };
  const piece: StagePiece = {
    id: "ambiguous",
    stageId: "images",
    kind: "image",
    idx: 1,
    state: "running",
    payload: JSON.stringify({ promptName: "Landscape", prompt: "Coast" }),
  };
  expect(() => legacyPieceKey(piece, "images", [first, second])).toThrow(
    "matches multiple outputs",
  );
  expect(() =>
    legacyPieceKey({ ...piece, payload: JSON.stringify({ file: first.path }) }, "images", [
      first,
      second,
    ]),
  ).toThrow("matches multiple outputs");
});

it.each([
  [undefined, undefined],
  [undefined, "Landscape"],
  ["Landscape", undefined],
])(
  "matches unique index and prompt when either recorded prompt name is absent",
  (pieceName, outputName) => {
    const output = readyView().outputs.find((row) => row.output.role === "image")?.output;
    if (output === undefined) throw new Error("Missing image fixture");
    const matched = {
      ...output,
      meta: {
        index: 1,
        prompt: "Coast",
        ...(outputName === undefined ? {} : { promptName: outputName }),
      },
    };
    const piece: StagePiece = {
      id: "unfinished",
      stageId: "images",
      kind: "image",
      idx: 1,
      state: "running",
      payload: JSON.stringify({
        prompt: "Coast",
        ...(pieceName === undefined ? {} : { promptName: pieceName }),
      }),
    };
    expect(legacyImageOutput(piece, [matched])).toEqual(matched);
  },
);
