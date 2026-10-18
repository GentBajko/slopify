import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { outputPath } from "../storage/layout.js";
import { narrationCatalogue, narrationFixture } from "./runtime-narration.fake.js";

// The intro and outro around a provided article: a text intro spoken as rendered, an outro the
// text model writes from the article's plain text, each narrated as its own file.

const article =
  "# Rope\n\nRope is **twisted** fibre.\n\n## Sources Consulted\n\n- Secret source https://example.test/rope\n";

function entriesFixture(outro: string) {
  return narrationFixture(article, {
    config: {
      llm: { provider: "openrouter", model: "llm" },
      chunking: { mode: "whole" },
      intro: { name: "Greeting", mode: "text" },
      outro: { name: "Ending", mode: "llm" },
      values: { topic: "rope" },
      rendered: { intro: "Welcome to the channel.", outro: "Write a sign-off." },
    },
    catalogue: {
      ...narrationCatalogue,
      tts: narrationCatalogue.tts.map((model) => ({
        ...model,
        tts: { ...model.tts, maxCharacters: 4000 },
      })),
    },
    answer: (key) => (key === "entry:outro:text" ? outro : ""),
  });
}

it("speaks a text intro as rendered and an outro written from the plain article", async () => {
  const h = await entriesFixture("Thanks for watching.");
  try {
    await h.pump();
    const llm = h.calls.filter((call) => call.kind === "llm");
    expect(llm.map((call) => call.key)).toEqual(["entry:outro:text"]);
    const asked = llm[0]?.text ?? "";
    expect(asked).toContain("Write a sign-off.");
    expect(asked).toContain("topic: rope");
    expect(asked).toContain("Rope is twisted fibre.");
    expect(asked).not.toContain("**");
    expect(asked).not.toContain("Secret source");
    const spoken = h.calls.filter((call) => call.kind === "tts").map((call) => call.text);
    expect([...spoken].sort()).toEqual([
      "Rope\n\nRope is twisted fibre.",
      "Thanks for watching.",
      "Welcome to the channel.",
    ]);
    const view = h.view();
    for (const role of ["audio_intro", "audio_body", "audio_outro"]) {
      const row = view.outputs.find((one) => one.selected && one.output.role === role);
      expect(row?.state, role).toBe("ready");
      // Each file's own measured length: the fixture's narration is a tenth of a second.
      expect(row?.output.durationMs, role).toBeCloseTo(100, -1);
    }
    const instructions = view.outputs.find(
      (row) =>
        row.selected && row.workKey === "entry:outro:text" && row.output.role === "instructions",
    );
    if (instructions === undefined) throw new Error("The outro's instructions were not kept.");
    expect(
      readFileSync(outputPath(h.deps.paths, h.projectId, instructions.output.path), "utf8"),
    ).toContain("Write a sign-off.");
    const audio = h.count.mock.calls
      .map(([, payload]) => payload as Record<string, unknown>)
      .filter((payload) => payload.stage === "audio");
    expect(audio.map((payload) => payload.segment ?? "body").sort()).toEqual([
      "body",
      "intro",
      "outro",
    ]);
    for (const payload of audio)
      expect(payload).toMatchObject({
        provider: "openai-tts",
        model: "tts",
        audioSeconds: 0.1,
      });
  } finally {
    h.close();
  }
}, 30_000);

it("refuses an outro the text model left empty and narrates nothing from it", async () => {
  const h = await entriesFixture("  ");
  try {
    await expect(h.pump()).rejects.toThrow(/empty answer/);
    expect(h.calls.some((call) => call.kind === "tts" && call.text.trim() === "")).toBe(false);
    expect(h.view().outputs.some((row) => row.selected && row.output.role === "audio_outro")).toBe(
      false,
    );
  } finally {
    h.close();
  }
}, 30_000);
