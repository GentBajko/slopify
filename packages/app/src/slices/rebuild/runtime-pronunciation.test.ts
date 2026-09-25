import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { outputPath } from "../storage/layout.js";
import { revisionTranscript } from "./runtime-export-inputs.js";
import { narrationFixture, preparationCatalogue } from "./runtime-narration.fake.js";
import { executionPlan } from "./runtime-plan.js";

const audio = {
  provider: "inworld",
  model: "inworld-tts-2",
  voice: "voice",
  usePronunciationGlossary: true,
};
const markdown = "John reads.\n\n## Pronunciation Glossary\nJohn: /dʒɑn/";
const cues = JSON.stringify({
  cues: [
    { sentence: 1, kind: "instruction", text: "calm" },
    { sentence: 1, kind: "sound", sound: "sigh" },
  ],
});

it.each(["inworld-tts-2", "inworld-tts-2-flash"])(
  "publishes clean text and exact scripts with preparation off on %s",
  async (model) => {
    const catalogue = {
      ...preparationCatalogue,
      tts: preparationCatalogue.tts.map((row) => ({ ...row, id: model })),
    };
    const h = await narrationFixture(markdown, {
      config: { audio: { ...audio, model } },
      catalogue,
    });
    try {
      await h.pump();
      expect(h.calls.filter((call) => call.kind === "llm")).toEqual([]);
      expect(h.calls.filter((call) => call.kind === "tts").map((call) => call.text)).toEqual([
        "/dʒɑn/ reads.",
      ]);
      const view = h.view();
      const plan = executionPlan(h.deps, view, catalogue);
      expect(view.articleMarkdown).toBe(markdown);
      expect(revisionTranscript(h.deps, { view, plan }, "body")).toBe("John reads.");
      for (const [role, expected] of [
        ["narration_txt", "John reads."],
        ["tts_script", "/dʒɑn/ reads."],
      ]) {
        const file = view.outputs.find((row) => row.selected && row.output.role === role);
        if (!file) throw new Error(`Missing ${role}`);
        expect(readFileSync(outputPath(h.deps.paths, h.projectId, file.output.path), "utf8")).toBe(
          expected,
        );
      }
      const incomplete = {
        ...view,
        pieces: view.pieces.map((row) =>
          row.piece.kind === "chunk"
            ? {
                ...row,
                piece: { ...row.piece, payload: JSON.stringify({ text: "/dʒɑn/ reads." }) },
              }
            : row,
        ),
      };
      expect(() => revisionTranscript(h.deps, { view: incomplete, plan }, "body")).toThrow(
        /exact clean transcript/,
      );
    } finally {
      h.close();
    }
  },
);

it("counts encoded IPA plus cues, carries delivery and never repeats a one-shot sound", async () => {
  const source = "John reads. John smiles. John waits 😀.";
  const h = await narrationFixture(`${source}\n\n## Pronunciation Glossary\nJohn: /dʒɑn/`, {
    config: {
      audio,
      narrationPrompt: "Delivery",
      llm: { provider: "openrouter", model: "llm" },
      rendered: { narration: "Restrained." },
    },
    catalogue: preparationCatalogue,
    answer: () => cues,
  });
  try {
    await h.pump();
    const requests = h.calls.filter((call) => call.kind === "tts").map((call) => call.text);
    expect(h.calls.filter((call) => call.kind === "llm")).toHaveLength(1);
    expect(requests.length).toBeGreaterThan(1);
    expect(requests.every((text) => text.length <= 24 && text.startsWith("[calm] "))).toBe(true);
    expect(requests.join("").match(/\[sigh\]/g)).toHaveLength(1);
    expect(requests.join("").match(/\/dʒɑn\//g)).toHaveLength(3);
    for (const text of requests) {
      expect(text.replaceAll("/dʒɑn/", "")).not.toContain("/");
      expect(Buffer.from(text).toString("utf8")).toBe(text);
    }
    const view = h.view();
    expect(
      revisionTranscript(
        h.deps,
        { view, plan: executionPlan(h.deps, view, preparationCatalogue) },
        "body",
      ),
    ).toBe(source);
  } finally {
    h.close();
  }
});

it.each([false, true])(
  "refuses invalid unused glossary before any new cue or TTS call (prep=%s)",
  async (prepare) => {
    const h = await narrationFixture(`${markdown}\nUnused: not IPA`, {
      config: {
        audio,
        ...(prepare
          ? {
              narrationPrompt: "Delivery",
              llm: { provider: "openrouter", model: "llm" },
              rendered: { narration: "Restrained." },
            }
          : {}),
      },
      catalogue: preparationCatalogue,
      answer: () => cues,
    });
    try {
      await h.pump();
      expect(h.calls).toEqual([]);
      const plan = executionPlan(h.deps, h.view(), preparationCatalogue);
      expect(plan.recipes.some((row) => row.refusal && row.unresolved)).toBe(true);
      expect(plan.work.some((row) => row.stage === "audio" && row.disposition === "blocked")).toBe(
        true,
      );
    } finally {
      h.close();
    }
  },
);

it("resolves generated glossary before literal/generated entry audio", async () => {
  const h = await narrationFixture("", {
    config: {
      audio,
      llm: { provider: "openrouter", model: "llm" },
      provided: {},
      sources: {
        research: "off",
        article: "generate",
        audio: "generate",
        images: "off",
        thumbnail: "off",
        video: "off",
      },
      intro: { name: "Intro", mode: "text" },
      outro: { name: "Outro", mode: "llm" },
      rendered: { article: "Write about John.", intro: "John arrives.", outro: "Write a goodbye." },
    },
    catalogue: preparationCatalogue,
    answer: (key) => (key === "article:body" ? markdown : "John leaves."),
  });
  try {
    const pending = executionPlan(h.deps, h.view(), preparationCatalogue);
    expect(pending.recipes.find((row) => row.key === "entry:intro:text")?.input.kind).toBe("local");
    expect(pending.recipes.find((row) => row.key === "audio:intro:future")?.dependsOn).toContain(
      "article:body",
    );
    expect(pending.recipes.some((row) => row.input.kind === "tts")).toBe(false);
    await h.pump();
    const articleCall = h.calls.findIndex((call) => call.key === "article:body");
    expect(articleCall).toBeGreaterThanOrEqual(0);
    expect(h.calls.findIndex((call) => call.kind === "tts")).toBeGreaterThan(articleCall);
    expect(
      h.calls
        .filter((call) => call.kind === "tts")
        .map((call) => call.text)
        .sort(),
    ).toEqual(["/dʒɑn/ arrives.", "/dʒɑn/ leaves.", "/dʒɑn/ reads."]);
    const view = h.view();
    const plan = executionPlan(h.deps, view, preparationCatalogue);
    for (const [segment, expected] of [
      ["intro", "John arrives."],
      ["body", "John reads."],
      ["outro", "John leaves."],
    ] as const)
      expect(revisionTranscript(h.deps, { view, plan }, segment)).toBe(expected);
    expect(
      view.outputs.filter(
        (row) => row.selected && ["narration_txt", "tts_script"].includes(row.output.role),
      ),
    ).toHaveLength(6);
  } finally {
    h.close();
  }
}, 30_000);
