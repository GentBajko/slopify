import { expect, it } from "vitest";
import { saveRevision } from "../revisions/mutations.js";
import { admitPendingRevision } from "./legacy-admission.fake.js";
import { narrationFixture, preparationCatalogue } from "./runtime-narration.fake.js";
import { executionPlan } from "./runtime-plan.js";

const prepared = {
  narrationPrompt: "Documentary",
  llm: { provider: "openrouter", model: "llm" },
  audio: { provider: "inworld", model: "inworld-tts-2", voice: "voice" },
  rendered: { narration: "Use restrained delivery." },
};
const cues = '{"cues":[{"sentence":1,"kind":"instruction","text":"calm"}]}';
it("persists preparation once, then sends bounded tagged requests with clean text", async () => {
  const h = await narrationFixture("First sentence. Second sentence.", {
    config: prepared,
    catalogue: preparationCatalogue,
    answer: () => cues,
  });
  try {
    await h.pump();
    expect(h.calls.filter((call) => call.kind === "llm")).toHaveLength(1);
    expect(h.calls.filter((call) => call.kind === "tts").length).toBeGreaterThan(1);
    expect(
      h.calls
        .filter((call) => call.kind === "tts")
        .every((call) => call.text.startsWith("[calm]") && call.text.length <= 24),
    ).toBe(true);
    const pieces = h.view().pieces.filter((row) => row.selected && row.piece.kind === "chunk");
    expect(pieces.map((row) => JSON.parse(row.piece.payload ?? "{}").spokenText).join("")).toBe(
      "First sentence. Second sentence.",
    );
    expect(h.view().outputs.some((row) => row.selected && row.output.role === "audio_body")).toBe(
      true,
    );
    await h.pump();
    expect(h.calls.filter((call) => call.kind === "llm")).toHaveLength(1);
  } finally {
    h.close();
  }
});

it("prepares each logical paragraph and never mistakes preparation for an audio chunk", async () => {
  const h = await narrationFixture("First paragraph.\n\nSecond paragraph.", {
    config: prepared,
    catalogue: preparationCatalogue,
    answer: () => cues,
  });
  try {
    await h.pump();
    expect(h.calls.filter((call) => call.kind === "llm")).toHaveLength(2);
    expect(
      h
        .view()
        .pieces.filter((row) => row.selected && row.key.startsWith("narration:prepare:"))
        .every((row) => row.piece.kind === "prompt_written"),
    ).toBe(true);
    expect(h.view().outputs.some((row) => row.selected && row.output.role === "audio_body")).toBe(
      true,
    );
  } finally {
    h.close();
  }
});

it("keeps repeated paragraphs distinct and waits for every preparation before TTS", async () => {
  const h = await narrationFixture("Repeated sentence.\n\nRepeated sentence.", {
    config: prepared,
    catalogue: preparationCatalogue,
    answer: () => cues,
  });
  try {
    for (let n = 0; n < 5 && !h.calls.some((call) => call.kind === "llm"); n++) await h.pump(1);
    expect(h.calls.filter((call) => call.kind === "llm")).toHaveLength(1);
    expect(h.calls.filter((call) => call.kind === "tts")).toEqual([]);
    expect(
      executionPlan(h.deps, h.view(), preparationCatalogue).recipes.some(
        (row) => row.key === "audio:body:future",
      ),
    ).toBe(true);
    await h.pump();
    const keys = h.calls.filter((call) => call.kind === "llm").map((call) => call.key);
    expect(new Set(keys).size).toBe(2);
    expect(h.view().outputs.some((row) => row.selected && row.output.role === "audio_body")).toBe(
      true,
    );
  } finally {
    h.close();
  }
});

it("bypasses preparation and TTS for an uploaded logical group", async () => {
  const h = await narrationFixture("A short sentence.", {
    config: prepared,
    catalogue: preparationCatalogue,
    answer: () => cues,
  });
  try {
    await h.pump();
    const old = h.view();
    const part = old.pieces.find((row) => row.selected && row.piece.kind === "chunk");
    if (part?.assetId === null || part === undefined) throw new Error("Missing audio");
    const key = JSON.parse(part.piece.payload ?? "{}").logicalKey;
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: old.revision.id,
      idempotencyKey: "uploaded",
      edit: {
        config: old.revision.config,
        content: {
          ...old.revision.content,
          narrationOverrides: { [key]: { kind: "asset", assetId: part.assetId } },
        },
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    h.calls.length = 0;
    admitPendingRevision(h.deps, saved.view, preparationCatalogue);
    await h.pump();
    expect(h.calls).toEqual([]);
    expect(
      executionPlan(h.deps, h.view(), preparationCatalogue).recipes.some((row) =>
        row.key.startsWith("narration:prepare:"),
      ),
    ).toBe(false);
  } finally {
    h.close();
  }
});

it("does not submit TTS for invalid cue answers", async () => {
  const h = await narrationFixture("Exact narration.", {
    config: prepared,
    catalogue: preparationCatalogue,
    answer: () => '{"text":"rewritten"}',
  });
  try {
    await expect(h.pump()).rejects.toThrow();
    expect(h.calls.some((call) => call.kind === "tts")).toBe(false);
  } finally {
    h.close();
  }
});

it.each(["title", "voice", "prompt", "source", "regenerate"] as const)(
  "preserves preparation appropriately after a %s edit",
  async (change) => {
    const h = await narrationFixture("First sentence. Second sentence.", {
      config: prepared,
      catalogue: preparationCatalogue,
      answer: () => cues,
    });
    try {
      await h.pump();
      const old = h.view();
      const first = old.pieces.find((row) => row.selected && row.piece.kind === "chunk");
      const logicalKey = JSON.parse(first?.piece.payload ?? "{}").logicalKey;
      h.calls.length = 0;
      const saved = await saveRevision(h.deps, {
        projectId: h.projectId,
        baseRevisionId: old.revision.id,
        idempotencyKey: change,
        edit: {
          config: {
            ...old.revision.config,
            ...(change === "title" ? { title: "Renamed" } : {}),
            ...(change === "voice" ? { audio: { ...prepared.audio, voice: "new" } } : {}),
            ...(change === "prompt"
              ? { rendered: { ...old.revision.config.rendered, narration: "Different style." } }
              : {}),
          },
          content:
            change === "source"
              ? {
                  ...old.revision.content,
                  narrationOverrides: {
                    [logicalKey]: { kind: "text", text: "An edited narration." },
                  },
                }
              : old.revision.content,
          ...(change === "regenerate" ? { regenerate: [logicalKey] } : {}),
        },
      });
      if (!saved.ok) throw new Error(JSON.stringify(saved));
      expect(h.calls).toEqual([]);
      admitPendingRevision(h.deps, saved.view, preparationCatalogue);
      await h.pump();
      expect(h.calls.filter((call) => call.kind === "llm")).toHaveLength(
        change === "prompt" || change === "source" ? 1 : 0,
      );
      expect(
        h
          .view()
          .outputs.some(
            (row) => row.selected && row.state === "ready" && row.output.role === "audio_body",
          ),
      ).toBe(true);
      if (change === "title") expect(h.calls).toEqual([]);
      if (change === "voice" || change === "regenerate")
        expect(h.calls.some((call) => call.kind === "tts")).toBe(true);
      expect(
        executionPlan(h.deps, h.view(), preparationCatalogue)
          .work.filter((row) => row.key.startsWith("narration:prepare:"))
          .every((row) => row.disposition === "reuse"),
      ).toBe(true);
    } finally {
      h.close();
    }
  },
);

it("resolves generated article and entry text before their separate preparation calls", async () => {
  const h = await narrationFixture("", {
    config: {
      ...prepared,
      provided: {},
      sources: {
        research: "off",
        article: "generate",
        audio: "generate",
        images: "off",
        thumbnail: "off",
        video: "off",
      },
      intro: { name: "Intro", mode: "llm" },
      outro: { name: "Outro", mode: "text" },
      rendered: {
        ...prepared.rendered,
        article: "Write facts.",
        intro: "Introduce.",
        outro: "Goodbye.",
      },
    },
    catalogue: preparationCatalogue,
    answer: (key) =>
      key.startsWith("narration:prepare:")
        ? cues
        : key === "article:body"
          ? "Article sentence."
          : "Hello there.",
  });
  try {
    await h.pump();
    expect(h.calls.filter((call) => call.key.startsWith("narration:prepare:"))).toHaveLength(3);
    for (const role of ["audio_body", "audio_intro", "audio_outro"])
      expect(h.view().outputs.some((row) => row.selected && row.output.role === role)).toBe(true);
  } finally {
    h.close();
  }
});

it("retains preparation with a resolved thinking configuration", async () => {
  const catalogue = {
    ...preparationCatalogue,
    llm: preparationCatalogue.llm.map((model) => ({
      ...model,
      llm: { ...model.llm, thinking: { high: { effort: "high" as const } } },
    })),
  };
  const h = await narrationFixture("Thinking narration.", {
    config: { ...prepared, llm: { ...prepared.llm, thinking: "high" } },
    catalogue,
    answer: () => cues,
  });
  try {
    await h.pump();
    expect(h.calls.filter((call) => call.kind === "llm")).toHaveLength(1);
    const old = h.view();
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: old.revision.id,
      idempotencyKey: "thinking-title",
      edit: { config: { ...old.revision.config, title: "Renamed" }, content: old.revision.content },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    h.calls.length = 0;
    admitPendingRevision(h.deps, saved.view, catalogue);
    await h.pump();
    expect(h.calls).toEqual([]);
    expect(
      executionPlan(h.deps, h.view(), catalogue)
        .work.filter((row) => row.key.startsWith("narration:prepare:"))
        .every((row) => row.disposition === "reuse"),
    ).toBe(true);
  } finally {
    h.close();
  }
});
