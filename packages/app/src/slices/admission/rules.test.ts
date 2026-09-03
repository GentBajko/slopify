import { describe, expect, it } from "vitest";
import type { StageKind } from "../../kernel/pipeline.js";
import { stageKinds } from "../../kernel/pipeline.js";
import type { StagedFile } from "../storage/model.js";
import type { RunDraft, StageSource } from "./model.js";
import { stageSources } from "./model.js";
import { admit, allowedSources } from "./rules.js";

function staged(
  id: string,
  stageKind: StageKind,
  state: StagedFile["state"] = "staged",
): StagedFile {
  return {
    id,
    stageKind,
    path: id,
    originalFilename: `${id}.bin`,
    bytes: 10,
    state,
    createdAt: "2026-09-02T10:00:00.000Z",
  };
}

// The skeleton run: every stage provided or off, which is what S4 can actually execute.
function provided(over: Partial<RunDraft> = {}): RunDraft {
  return {
    title: "Rope Tricks",
    format: "16:9",
    sources: {
      research: "off",
      article: "provide",
      audio: "provide",
      images: "provide",
      thumbnail: "off",
      video: "generate",
    },
    imagePrompts: [],
    values: {},
    provided: { article: "The article.", audio: "a1", images: ["i1", "i2"] },
    silenceGapSeconds: 3,
    ...over,
  };
}

const files = [staged("a1", "audio"), staged("i1", "images"), staged("i2", "images")];

function fields(draft: RunDraft, over: Partial<Parameters<typeof admit>[0]> = {}): string[] {
  const result = admit({ draft, staged: files, requiredSlots: [], ...over });
  return result.ok ? [] : result.fields.map((field) => field.field);
}

function sources(over: Partial<Record<StageKind, StageSource>>): Record<StageKind, StageSource> {
  return { ...provided().sources, ...over };
}

describe("admit", () => {
  it("accepts a run whose every stage is provided or off", () => {
    const result = admit({ draft: provided(), staged: files, requiredSlots: [] });
    expect(result.ok).toBe(true);
  });

  it("trims the title and the keyword values it hands back", () => {
    const result = admit({
      draft: provided({ title: "  Rope Tricks  ", values: { topic: " rope  " } }),
      staged: files,
      requiredSlots: ["topic"],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.title).toBe("Rope Tricks");
      expect(result.draft.values).toEqual({ topic: "rope" });
    }
  });
});

describe("title", () => {
  it("refuses an empty or whitespace-only title", () => {
    expect(fields(provided({ title: "   " }))).toEqual(["title"]);
  });

  it("accepts exactly 200 characters and refuses 201", () => {
    expect(fields(provided({ title: "t".repeat(200) }))).toEqual([]);
    expect(fields(provided({ title: "t".repeat(201) }))).toEqual(["title"]);
  });
});

describe("sources", () => {
  // The switches on Play are drawn from `allowedSources`, so what the control offers and
  // what this rule accepts have to be the same list for every stage.
  it("refuses exactly the sources allowedSources leaves out", () => {
    for (const kind of stageKinds) {
      for (const source of stageSources) {
        const marked = fields(provided({ sources: sources({ [kind]: source }) })).includes(
          `sources.${kind}`,
        );
        // Video is normalised back to generate before the check, and a provided article
        // forces research off, so neither stage can be marked whatever the form said.
        const normalised = kind === "video" || (kind === "research" && source !== "off");
        expect([kind, source, marked]).toEqual([
          kind,
          source,
          !normalised && !allowedSources[kind].includes(source),
        ]);
      }
    }
  });

  it("refuses images set to off, because a run always has an image source", () => {
    expect(fields(provided({ sources: sources({ images: "off" }) }))).toContain("sources.images");
  });

  it("refuses article or audio set to off", () => {
    expect(fields(provided({ sources: sources({ article: "off" }) }))).toContain("sources.article");
    expect(fields(provided({ sources: sources({ audio: "off" }) }))).toContain("sources.audio");
  });

  it("forces research off when the article is provided", () => {
    const result = admit({
      draft: provided({ sources: sources({ research: "generate", article: "provide" }) }),
      staged: files,
      requiredSlots: [],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.sources.research).toBe("off");
    }
  });

  it("forces video to generate whatever the form asked for", () => {
    const result = admit({
      draft: provided({ sources: sources({ video: "provide" }) }),
      staged: files,
      requiredSlots: [],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.sources.video).toBe("generate");
    }
  });

  it("accepts the thumbnail's four modes and nothing else", () => {
    for (const source of ["off", "from_prompt", "prompt_by_llm", "provide"] as const) {
      expect(fields(provided({ sources: sources({ thumbnail: source }) }))).not.toContain(
        "sources.thumbnail",
      );
    }
    expect(fields(provided({ sources: sources({ thumbnail: "generate" }) }))).toContain(
      "sources.thumbnail",
    );
  });
});

describe("the LLM row", () => {
  const generating = provided({
    sources: sources({ research: "off", article: "generate" }),
    articlePrompt: "House style",
    provided: { audio: "a1", images: ["i1", "i2"] },
  });

  it("is required when the article is generated", () => {
    expect(fields(generating)).toEqual(["llm"]);
  });

  it("is required when research is generated", () => {
    expect(
      fields(
        provided({
          sources: sources({ research: "generate", article: "provide" }),
        }),
      ),
    ).toEqual([]);
    // Research is forced off by a provided article, so ask with a generated article too.
    expect(
      fields({ ...generating, sources: sources({ research: "generate", article: "generate" }) }),
    ).toContain("llm");
  });

  it("is required when the thumbnail prompt is written by an LLM", () => {
    expect(
      fields(
        provided({ sources: sources({ thumbnail: "prompt_by_llm" }), thumbnailPrompt: "Bold" }),
      ),
    ).toEqual(["llm"]);
  });

  it("is required when a picked intro or outro is in LLM mode", () => {
    expect(fields(provided({ intro: { name: "Welcome", mode: "llm" } }))).toEqual(["llm"]);
    expect(fields(provided({ outro: { name: "Bye", mode: "llm" } }))).toEqual(["llm"]);
  });

  it("is not required for a Text-mode intro on an otherwise provided run", () => {
    expect(fields(provided({ intro: { name: "Welcome", mode: "text" } }))).toEqual([]);
  });

  it("is satisfied by a provider and a model together", () => {
    expect(fields({ ...generating, llm: { provider: "anthropic", model: "claude" } })).toEqual([]);
    expect(fields({ ...generating, llm: { provider: "anthropic", model: " " } })).toEqual(["llm"]);
  });
});

describe("generated stages", () => {
  it("asks for the article prompt, the voice, and the image row", () => {
    expect(
      fields(
        provided({
          sources: sources({ article: "generate", audio: "generate", images: "generate" }),
          llm: { provider: "anthropic", model: "claude" },
          provided: {},
        }),
      ),
    ).toEqual(["articlePrompt", "audio", "imagePrompts", "images"]);
  });

  it("asks for a voice once a narration provider and model are picked", () => {
    expect(
      fields(
        provided({
          sources: sources({ audio: "generate" }),
          audio: { provider: "elevenlabs", model: "v3", voice: "" },
          provided: { article: "The article.", images: ["i1", "i2"] },
        }),
      ),
    ).toEqual(["audio.voice"]);
  });

  it("accepts a Number of exactly 1 and exactly 20 and refuses 0 and 21", () => {
    const withNumber = (number: number): RunDraft =>
      provided({
        sources: sources({ images: "generate" }),
        images: { provider: "openai", model: "gpt-image" },
        imagePrompts: [{ name: "Scene", number }],
        provided: { article: "The article.", audio: "a1" },
      });
    expect(fields(withNumber(1))).toEqual([]);
    expect(fields(withNumber(20))).toEqual([]);
    expect(fields(withNumber(0))).toEqual(["imagePrompts.0.number"]);
    expect(fields(withNumber(21))).toEqual(["imagePrompts.0.number"]);
    expect(fields(withNumber(2.5))).toEqual(["imagePrompts.0.number"]);
  });

  it("accepts exactly 60 images across the run and refuses 61", () => {
    const withPrompts = (numbers: number[]): RunDraft =>
      provided({
        sources: sources({ images: "generate" }),
        images: { provider: "openai", model: "gpt-image" },
        imagePrompts: numbers.map((number, index) => ({ name: `Scene ${index}`, number })),
        provided: { article: "The article.", audio: "a1" },
      });
    expect(fields(withPrompts([20, 20, 20]))).toEqual([]);
    expect(fields(withPrompts([20, 20, 20, 1]))).toEqual(["imagePrompts"]);
  });

  it("asks for a thumbnail prompt in both generate modes", () => {
    for (const source of ["from_prompt", "prompt_by_llm"] as const) {
      expect(fields(provided({ sources: sources({ thumbnail: source }) }))).toContain(
        "thumbnailPrompt",
      );
    }
  });
});

describe("provided content", () => {
  it("asks for pasted research notes and a pasted article", () => {
    expect(
      fields(
        provided({
          sources: sources({ research: "provide", article: "provide" }),
          provided: { article: "  ", audio: "a1", images: ["i1"] },
        }),
      ),
    ).toEqual(["provided.article"]);
  });

  it("keeps a provided research paste when the article is generated", () => {
    expect(
      fields(
        provided({
          sources: sources({ research: "provide", article: "generate" }),
          llm: { provider: "anthropic", model: "claude" },
          articlePrompt: "House style",
          provided: { audio: "a1", images: ["i1"] },
        }),
      ),
    ).toEqual(["provided.research"]);
  });

  it("refuses an upload that is still copying", () => {
    expect(
      fields(provided(), { staged: [staged("a1", "audio", "copying"), ...files.slice(1)] }),
    ).toEqual(["provided.audio"]);
  });

  it("refuses an id that was never staged, or was staged for another stage", () => {
    expect(fields(provided({ provided: { article: "x", audio: "nope", images: ["i1"] } }))).toEqual(
      ["provided.audio"],
    );
    expect(fields(provided({ provided: { article: "x", audio: "i1", images: ["i1"] } }))).toEqual([
      "provided.audio",
    ]);
  });

  it("refuses an empty image list and one over sixty", () => {
    expect(fields(provided({ provided: { article: "x", audio: "a1", images: [] } }))).toEqual([
      "provided.images",
    ]);
    const many = Array.from({ length: 61 }, (_value, index) => `x${index}`);
    expect(fields(provided({ provided: { article: "x", audio: "a1", images: many } }))).toContain(
      "provided.images",
    );
  });

  it("refuses the same image picked twice", () => {
    expect(
      fields(provided({ provided: { article: "x", audio: "a1", images: ["i1", "i1"] } })),
    ).toEqual(["provided.images"]);
  });

  it("asks for a thumbnail file when the thumbnail is provided", () => {
    expect(fields(provided({ sources: sources({ thumbnail: "provide" }) }))).toEqual([
      "provided.thumbnail",
    ]);
  });
});

describe("keyword values", () => {
  it("asks for every slot the selected bodies use", () => {
    expect(fields(provided(), { requiredSlots: ["topic", "tone"] })).toEqual([
      "values.topic",
      "values.tone",
    ]);
  });

  it("refuses a value that is empty after trimming", () => {
    expect(fields(provided({ values: { topic: "   " } }), { requiredSlots: ["topic"] })).toEqual([
      "values.topic",
    ]);
  });

  it("accepts exactly 200 characters and refuses 201", () => {
    expect(
      fields(provided({ values: { topic: "v".repeat(200) } }), { requiredSlots: ["topic"] }),
    ).toEqual([]);
    expect(
      fields(provided({ values: { topic: "v".repeat(201) } }), { requiredSlots: ["topic"] }),
    ).toEqual(["values.topic"]);
  });

  it("refuses a multi-line value", () => {
    expect(
      fields(provided({ values: { topic: "one\ntwo" } }), { requiredSlots: ["topic"] }),
    ).toEqual(["values.topic"]);
  });

  it("asks for a slot named after a prototype member like any other", () => {
    expect(fields(provided(), { requiredSlots: ["constructor", "toString"] })).toEqual([
      "values.constructor",
      "values.toString",
    ]);
  });

  it("keeps a value posted under __proto__ as an ordinary slot", () => {
    // JSON.parse makes __proto__ an own property, but assigning it onto a normal object
    // runs the setter and drops it: the user's field would vanish without a word.
    const posted = JSON.parse('{"__proto__": "sneaky", "topic": "rope"}') as Record<string, string>;
    const result = admit({
      draft: provided({ values: posted }),
      staged: files,
      requiredSlots: ["topic", "__proto__"],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.getPrototypeOf(result.draft.values)).toBeNull();
      expect(Object.getOwnPropertyDescriptor(result.draft.values, "__proto__")?.value).toBe(
        "sneaky",
      );
    }
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });

  it("ignores a value no selected body asks for", () => {
    expect(fields(provided({ values: { unused: "" } }))).toEqual([]);
  });
});

describe("the silence gap", () => {
  it("accepts 0 and 30 and refuses anything outside", () => {
    expect(fields(provided({ silenceGapSeconds: 0 }))).toEqual([]);
    expect(fields(provided({ silenceGapSeconds: 30 }))).toEqual([]);
    expect(fields(provided({ silenceGapSeconds: -1 }))).toEqual(["silenceGapSeconds"]);
    expect(fields(provided({ silenceGapSeconds: 31 }))).toEqual(["silenceGapSeconds"]);
    expect(fields(provided({ silenceGapSeconds: Number.NaN }))).toEqual(["silenceGapSeconds"]);
  });
});
