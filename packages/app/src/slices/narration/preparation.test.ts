import { describe, expect, it } from "vitest";
import { preparationMessages, sourceSentences, validatePreparation } from "./preparation.js";

describe("narration preparation", () => {
  const source = "First [literal] line.  Second line!\nThird 😀 line.";
  it("numbers exact source slices and accepts only cue annotations", () => {
    expect(
      sourceSentences(source)
        .map((row) => row.text)
        .join(""),
    ).toBe(source);
    expect(sourceSentences(source).map((row) => row.sentence)).toEqual([1, 2, 3]);
    expect(
      validatePreparation(
        JSON.stringify({
          cues: [
            { sentence: 1, kind: "instruction", text: "measured documentary narration" },
            { sentence: 1, kind: "sound", sound: "sigh" },
            { sentence: 2, kind: "reset" },
          ],
        }),
        source,
      ).ok,
    ).toBe(true);
    expect(validatePreparation('{"cues":[]}', source)).toEqual({ ok: true, cues: [] });
    expect(validatePreparation('{"cues":[]}', "").ok).toBe(true);
  });
  it.each([
    "invalid",
    "[]",
    '```json\n{"cues":[]}\n```',
    '{"cues":[],"text":"rewritten"}',
    ...[0, -1, 0.5, 99].map((sentence) => JSON.stringify({ cues: [{ sentence, kind: "reset" }] })),
    JSON.stringify({
      cues: [
        { sentence: 2, kind: "reset" },
        { sentence: 1, kind: "reset" },
      ],
    }),
    JSON.stringify({
      cues: [
        { sentence: 1, kind: "instruction", text: "calm" },
        { sentence: 1, kind: "reset" },
      ],
    }),
    JSON.stringify({
      cues: [
        { sentence: 1, kind: "sound", sound: "sigh" },
        { sentence: 1, kind: "sound", sound: "sigh" },
      ],
    }),
    JSON.stringify({ cues: [{ sentence: 1, kind: "sound", sound: "scream" }] }),
    JSON.stringify({ cues: [{ sentence: 1, kind: "reset", text: "extra" }] }),
    ...["", " ", "a".repeat(241), "[calm]", "a\nb", "<speak>", "**calm**", "`calm`"].map((text) =>
      JSON.stringify({ cues: [{ sentence: 1, kind: "instruction", text }] }),
    ),
  ])("rejects invalid cue data: %s", (answer) => {
    expect(validatePreparation(answer, source).ok).toBe(false);
  });
  it("rejects cues for nonexistent source and accepts bounded combined directions", () => {
    expect(validatePreparation('{"cues":[{"sentence":1,"kind":"reset"}]}', "").ok).toBe(false);
    expect(
      validatePreparation(
        JSON.stringify({ cues: [{ sentence: 1, kind: "instruction", text: "a".repeat(240) }] }),
        source,
      ).ok,
    ).toBe(true);
  });
  it("separates the immutable format contract from user direction and source", () => {
    const messages = preparationMessages("Restrained delivery", source);
    expect(messages[0]).toMatchObject({ role: "system" });
    expect(messages[0]?.content).toContain("Never return or rewrite narration");
    expect(JSON.parse(messages[1]?.content ?? "null")).toEqual({
      direction: "Restrained delivery",
      sentences: sourceSentences(source),
    });
  });
});
