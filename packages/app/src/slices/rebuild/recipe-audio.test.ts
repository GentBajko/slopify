import { expect, it } from "vitest";
import { catalogue, config, content, readyView, workFor } from "./recipe-fixture.js";
import { planRevision, planRevisionWork } from "./recipes.js";

const narrated = {
  ...config,
  sources: { ...config.sources, audio: "generate" as const, video: "off" as const },
  chunking: { mode: "paragraph" as const },
  subtitles: {
    mode: "files" as const,
    language: "en" as const,
    fontId: "default",
    fontSize: 48,
    position: "bottom" as const,
  },
};
it("changing subtitle style preserves narration, WAV, and timing", () => {
  const plan = workFor(readyView(narrated), {
    ...narrated,
    subtitles: { ...narrated.subtitles, fontSize: 64 },
  });
  expect(plan.work.find((r) => r.key === "export:wav")?.disposition).toBe("reuse");
  expect(plan.work.find((r) => r.key === "subtitles:timing")?.disposition).toBe("reuse");
  expect(plan.work.find((r) => r.key === "subtitles:files")?.disposition).toBe("local");
});
it("editing manual cues keeps narration but a changed transcript requires review", () => {
  const base = readyView(narrated);
  const timing = base.revision.fingerprints["subtitles:timing"];
  if (timing === undefined) throw new Error("No timing");
  const manual = {
    ...content,
    subtitleCues: {
      audioFingerprint: timing,
      cues: [{ id: "c1", text: "First", start: 0, end: 0.5 }],
    },
  };
  expect(
    workFor(base, narrated, manual)
      .work.filter((r) => r.key.startsWith("audio:"))
      .every((r) => r.disposition === "reuse"),
  ).toBe(true);
  const withCues = readyView(narrated, manual);
  const plan = workFor(withCues, narrated, { ...manual, articleMarkdown: "Changed voice source." });
  expect(plan.work.find((r) => r.key === "subtitles:cues")?.disposition).toBe("review");
});
it("provided narration requires semantic review and missing provided files are blocked", () => {
  const c = { ...narrated, sources: { ...narrated.sources, audio: "provide" as const } };
  const supplied = { ...content, provided: { audio: "provided-audio" } };
  const base = readyView(c, supplied);
  const plan = workFor(base, c, { ...supplied, articleMarkdown: "Changed story" });
  expect(plan.work.find((r) => r.key === "audio:provided")?.disposition).toBe("review");
  const missing = planRevisionWork(base.revision, base, catalogue, new Set(), {
    articleMarkdown: base.articleMarkdown,
    researchNotes: null,
  });
  expect(missing.work.find((r) => r.key === "audio:provided")?.disposition).toBe("blocked");
});
it("changes every physical part of an edited logical request and preserves other chunks", () => {
  const small = {
    ...catalogue,
    tts: catalogue.tts.map((m) => ({ ...m, tts: { ...m.tts, maxCharacters: 8 } })),
  };
  const base = readyView(narrated);
  const resolved = { articleMarkdown: base.articleMarkdown, researchNotes: null };
  const old = planRevisionWork(
    base.revision,
    base,
    small,
    new Set(base.outputs.map((r) => r.assetId)),
    resolved,
  );
  const parts = old.recipes.filter((r) => r.input.kind === "tts");
  const first = parts[0];
  if (first?.input.kind !== "tts") throw new Error("Missing TTS part");
  const logicalKey = first.input.logicalKey;
  const modified = {
    ...base.revision,
    content: {
      ...content,
      narrationOverrides: {
        [first.input.logicalKey]: {
          kind: "text" as const,
          text: "Edited paragraph with new text.",
        },
      },
    },
  };
  const next = planRevisionWork(modified, base, small, new Set(), resolved);
  const oldGroup = parts.filter((r) => r.input.kind === "tts" && r.input.logicalKey === logicalKey);
  expect(
    next.recipes
      .filter((r) => r.input.kind === "tts" && r.input.logicalKey === logicalKey)
      .every(
        (r) => !oldGroup.some((oldPart) => oldPart.requestFingerprint === r.requestFingerprint),
      ),
  ).toBe(true);
  const oldOther = parts.filter((r) => r.input.kind === "tts" && r.input.logicalKey !== logicalKey);
  expect(
    oldOther.every((r) => next.recipes.some((n) => n.requestFingerprint === r.requestFingerprint)),
  ).toBe(true);
});
it("keeps request identity separate from regeneration tokens", () => {
  const base = readyView(narrated);
  const old = workFor(base);
  const first = old.recipes.find((r) => r.input.kind === "tts");
  if (first?.input.kind !== "tts") throw new Error("Missing chunk");
  const next = workFor(base, narrated, {
    ...content,
    regenerationTokens: { [first.input.logicalKey]: "again" },
  });
  const after = next.recipes.find((r) => r.key === first.key);
  expect(after?.requestFingerprint).toBe(first.requestFingerprint);
  expect(after?.fingerprint).not.toBe(first.fingerprint);
});
it("narrates selected Article-stage generated entry text instead of its prompt or Audio-stage text", () => {
  const c = {
    ...narrated,
    intro: { name: "Intro", mode: "llm" as const },
    rendered: { ...narrated.rendered, intro: "Write an opening" },
  };
  const base = readyView(c);
  const entry = base.revision.fingerprints["entry:intro:text"];
  if (entry === undefined) throw new Error("Missing entry");
  const pieces = [
    {
      key: "entry:intro:text",
      stageKind: "article" as const,
      piece: {
        id: "intro-piece",
        stageId: "article-stage",
        kind: "segment" as const,
        idx: 1,
        state: "done" as const,
        payload: JSON.stringify({
          category: "intro",
          mode: "llm",
          name: "Intro",
          text: " The spoken opening. ",
        }),
      },
      assetId: null,
      fingerprint: entry,
    },
  ];
  const plan = planRevisionWork(
    base.revision,
    { ...base, pieces },
    catalogue,
    new Set(base.outputs.map((row) => row.assetId)),
    { articleMarkdown: base.articleMarkdown, researchNotes: null },
  );
  const narration = plan.recipes.find((row) => row.key === "audio:intro:1");
  expect(narration?.input).toMatchObject({
    kind: "tts",
    text: "The spoken opening.",
    segment: "intro",
  });
  const audioStage = planRevisionWork(
    base.revision,
    { ...base, pieces: pieces.map((row) => ({ ...row, stageKind: "audio" as const })) },
    catalogue,
    new Set(),
    { articleMarkdown: base.articleMarkdown, researchNotes: null },
  );
  expect(audioStage.recipes.find((row) => row.key === "audio:intro:1")).toBeUndefined();
});
it("changing the voice invalidates all generated logical groups", () => {
  const base = readyView(narrated);
  const plan = workFor(base, {
    ...narrated,
    audio: { provider: "voice", model: "tts", voice: "v2" },
  });
  const narration = plan.work.filter(
    (row) => row.key.startsWith("audio:body:") && row.kind === "provider",
  );
  expect(narration.length).toBeGreaterThan(1);
  expect(narration.every((row) => row.disposition === "generate")).toBe(true);
});
it("refuses malformed and overlapping manual cues with field errors", () => {
  const base = readyView(narrated);
  const invalid = {
    ...content,
    subtitleCues: {
      audioFingerprint: "timing",
      cues: [
        { id: "a", text: "A", start: 0, end: 2 },
        { id: "b", text: "B", start: 1, end: 0 },
      ],
    },
  };
  const result = planRevision(base, { config: narrated, content: invalid });
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Invalid cues accepted");
  expect(result.fields.some((row) => row.field === "content.subtitleCues.cues.1.start")).toBe(true);
  expect(result.fields.some((row) => row.field === "content.subtitleCues.cues.1.end")).toBe(true);
});
it("gives repeated identical chunks separate stable keys and equal request identities", () => {
  const repeated = { ...content, articleMarkdown: "Repeat.\n\nRepeat." };
  const plan = workFor(readyView(narrated, repeated));
  const parts = plan.recipes.filter((row) => row.input.kind === "tts");
  expect(new Set(parts.map((row) => row.key)).size).toBe(2);
  expect(new Set(parts.map((row) => row.requestFingerprint)).size).toBe(1);
});
it("keeps deep-cloned retained cues savable when narration needs rebuilding", () => {
  const base = readyView(narrated);
  const withManual = {
    ...content,
    subtitleCues: {
      audioFingerprint: base.revision.fingerprints["subtitles:timing"] ?? "timing",
      cues: [{ id: "one", text: "Saved cue", start: 0, end: 1 }],
    },
  };
  const view = {
    ...base,
    revision: { ...base.revision, content: withManual },
    outputs: base.outputs.map((row) =>
      row.workKey.startsWith("audio:") ? { ...row, state: "outdated" as const } : row,
    ),
  };
  const result = planRevision(view, {
    config: { ...narrated, title: "Unrelated title" },
    content: structuredClone(withManual),
  });
  expect(result.ok).toBe(true);
});
it("binds every physical request part to its saved logical recipe fingerprint", () => {
  const base = readyView(narrated);
  const split = {
    ...catalogue,
    tts: catalogue.tts.map((model) => ({ ...model, tts: { ...model.tts, maxCharacters: 8 } })),
  };
  const plan = planRevisionWork(
    base.revision,
    base,
    split,
    new Set(base.outputs.map((row) => row.assetId)),
    { articleMarkdown: base.articleMarkdown, researchNotes: null },
  );
  const parts = plan.recipes.filter((row) => row.input.kind === "tts");
  expect(parts.length).toBeGreaterThan(2);
  for (const part of parts) {
    if (part.input.kind !== "tts") throw new Error("Missing request");
    expect(part.logicalFingerprint).toBe(base.revision.fingerprints[`${part.input.logicalKey}:1`]);
  }
});
