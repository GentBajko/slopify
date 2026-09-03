import type { Entry, Prompt } from "@app/slices/library/model.js";
import type { StagedFile } from "@app/slices/storage/model.js";
import { describe, expect, it } from "vitest";
import type { AdmissionInput } from "@/play/admission";
import { admission, keywordFields } from "@/play/admission";
import type { PlayFormState, Upload } from "@/play/state";
import { freshForm } from "@/play/state";

function prompt(kind: Prompt["kind"], name: string, body: string): Prompt {
  return { id: name, kind, name, body, slots: [], updatedAt: "2026-09-03T00:00:00.000Z" };
}

function entry(
  category: Entry["category"],
  name: string,
  body: string,
  mode: Entry["mode"],
): Entry {
  return {
    id: name,
    category,
    mode,
    name,
    body,
    slots: [],
    updatedAt: "2026-09-03T00:00:00.000Z",
  };
}

const prompts: readonly Prompt[] = [
  prompt("article", "Dossier", "Write about {{topic}} in {{minWords}} words."),
  prompt("image", "Oils", "An oil painting of {{topic}} in {{style}}."),
  prompt("image", "Maps", "A map of {{era}}."),
  prompt("thumbnail", "Title card", "A title card for {{topic}}."),
];

const entries: readonly Entry[] = [
  entry("intro", "Cold open", "Hook them with {{topic}}.", "text"),
  entry("outro", "Sting", "Ask them to subscribe.", "llm"),
];

function staged(id: string, stageKind: StagedFile["stageKind"]): StagedFile {
  return {
    id,
    stageKind,
    path: id,
    originalFilename: `${id}.bin`,
    bytes: 8,
    state: "staged",
    createdAt: "2026-09-03T00:00:00.000Z",
  };
}

function upload(id: string, stageKind: StagedFile["stageKind"]): Upload {
  return { key: id, name: `${id}.bin`, file: staged(id, stageKind), error: undefined };
}

function ask(form: PlayFormState): ReturnType<typeof admission> {
  const input: AdmissionInput = { form, prompts, entries, silenceGapSeconds: 3 };
  return admission(input);
}

// A run with every stage generated and every requirement met.
const generated: PlayFormState = {
  ...freshForm,
  title: "Rope Tricks",
  sources: { ...freshForm.sources, article: "generate", images: "generate" },
  llm: { provider: "claude-code", model: "sonnet" },
  audio: { provider: "elevenlabs", model: "eleven_multilingual_v2", voice: "Narrator" },
  images: { provider: "fal", model: "fal-ai/flux-2" },
  articlePrompt: "Dossier",
  imagePrompts: [{ name: "Oils", number: 8 }],
  values: { topic: "rope", minWords: "3000", style: "oil on canvas" },
};

describe("the hint names the first missing item", () => {
  it("asks for the article prompt on a fresh form, because it is the first rail", () => {
    const { result, blocker } = ask(freshForm);

    expect(result.ok).toBe(false);
    expect(blocker?.field).toBe("articlePrompt");
    expect(blocker?.hint).toBe("Pick an article prompt to play");
  });

  it("moves to the narration provider once the article prompt is picked", () => {
    expect(ask({ ...freshForm, articlePrompt: "Dossier" }).blocker?.hint).toBe(
      "Pick a narration provider to play",
    );
  });

  it("asks for the voice once the narration provider and model are picked", () => {
    const form: PlayFormState = {
      ...freshForm,
      articlePrompt: "Dossier",
      audio: { provider: "elevenlabs", model: "eleven_multilingual_v2", voice: "" },
    };

    expect(ask(form).blocker?.field).toBe("audio.voice");
    expect(ask(form).blocker?.hint).toBe("Pick a voice to play");
  });

  it("asks for an image prompt, then the image provider", () => {
    const audio = { provider: "elevenlabs", model: "eleven_multilingual_v2", voice: "Narrator" };
    const withAudio: PlayFormState = { ...freshForm, articlePrompt: "Dossier", audio };

    expect(ask(withAudio).blocker?.hint).toBe("Tick an image prompt to play");
    expect(ask({ ...withAudio, imagePrompts: [{ name: "Oils", number: 4 }] }).blocker?.hint).toBe(
      "Pick an image provider and model to play",
    );
  });

  it("asks for the title after every rail, because the cue sheet is read last", () => {
    const { blocker } = ask({ ...generated, title: "   ", values: {} });

    expect(blocker?.field).toBe("title");
    expect(blocker?.hint).toBe("Name the video to play");
  });

  it("asks for a shorter title when there is one and it is too long", () => {
    expect(ask({ ...generated, title: "x".repeat(201) }).blocker?.hint).toBe(
      "Shorten the title to 200 characters to play",
    );
  });

  it("asks for the keyword the picked prompts left empty, by name", () => {
    const { blocker } = ask({ ...generated, values: { topic: "rope", minWords: "3000" } });

    expect(blocker?.field).toBe("values.style");
    expect(blocker?.hint).toBe("Fill style to play");
  });

  it("refuses a keyword over 200 characters and a keyword with a newline", () => {
    const long = ask({ ...generated, values: { ...generated.values, topic: "x".repeat(201) } });
    expect(long.result.ok).toBe(false);
    expect(long.blocker?.field).toBe("values.topic");

    const lines = ask({ ...generated, values: { ...generated.values, topic: "a\nb" } });
    expect(lines.result.ok).toBe(false);
  });

  it("goes quiet when nothing is missing", () => {
    const { result, blocker } = ask(generated);

    expect(result.ok).toBe(true);
    expect(blocker).toBeUndefined();
  });
});

describe("the Number a ticked image prompt runs", () => {
  it("refuses nought and refuses twenty-one, and takes both bounds", () => {
    expect(ask({ ...generated, imagePrompts: [{ name: "Oils", number: 0 }] }).blocker?.hint).toBe(
      "Set a Number between 1 and 20 to play",
    );
    expect(ask({ ...generated, imagePrompts: [{ name: "Oils", number: 21 }] }).blocker?.hint).toBe(
      "Set a Number between 1 and 20 to play",
    );
    expect(ask({ ...generated, imagePrompts: [{ name: "Oils", number: 1 }] }).result.ok).toBe(true);
    expect(ask({ ...generated, imagePrompts: [{ name: "Oils", number: 20 }] }).result.ok).toBe(
      true,
    );
  });

  it("refuses sixty-one across the run and takes sixty", () => {
    const values = { ...generated.values, era: "AD&D 1e" };
    const over: PlayFormState = {
      ...generated,
      values,
      imagePrompts: [
        { name: "Oils", number: 20 },
        { name: "Maps", number: 20 },
        { name: "Oils", number: 20 },
      ],
    };

    expect(
      ask({
        ...over,
        imagePrompts: [
          { name: "Oils", number: 20 },
          { name: "Maps", number: 20 },
          { name: "Oils", number: 21 },
        ],
      }).blocker?.hint,
    ).toBe("Set a Number between 1 and 20 to play");
    expect(ask(over).result.ok).toBe(true);

    const sixtyOne: PlayFormState = {
      ...over,
      imagePrompts: [
        { name: "Oils", number: 20 },
        { name: "Maps", number: 20 },
        { name: "Oils", number: 20 },
        { name: "Maps", number: 1 },
      ],
    };
    expect(ask(sixtyOne).blocker?.hint).toBe(
      "Lower the Numbers to play: a run makes at most 60 images",
    );
  });
});

describe("the keyword fields the picked prompts ask for", () => {
  it("groups a name used on both sides as Common and the rest by side", () => {
    const fields = keywordFields({
      form: {
        ...generated,
        sources: { ...generated.sources, thumbnail: "from_prompt" },
        thumbnailPrompt: "Title card",
        imagePrompts: [{ name: "Maps", number: 2 }],
      },
      prompts,
      entries,
      silenceGapSeconds: 3,
    });

    expect(fields).toEqual([
      { name: "topic", group: "common" },
      { name: "minWords", group: "text" },
      { name: "era", group: "image" },
    ]);
  });

  it("drops a field when its prompt is unticked and brings it back when it is ticked again", () => {
    const withMaps: PlayFormState = {
      ...generated,
      imagePrompts: [
        { name: "Oils", number: 2 },
        { name: "Maps", number: 2 },
      ],
    };
    const input: AdmissionInput = { form: withMaps, prompts, entries, silenceGapSeconds: 3 };

    expect(keywordFields(input).map((field) => field.name)).toEqual([
      "topic",
      "minWords",
      "style",
      "era",
    ]);
    expect(keywordFields({ ...input, form: generated }).map((field) => field.name)).toEqual([
      "topic",
      "minWords",
      "style",
    ]);
  });

  it("asks for a provided stage's prompt nothing, and for a picked entry's slots always", () => {
    const provided: PlayFormState = {
      ...generated,
      sources: { ...generated.sources, article: "provide", images: "provide" },
      intro: "Cold open",
    };

    // Only the intro is left asking, and it asks for a name the article prompt also used.
    expect(keywordFields({ form: provided, prompts, entries, silenceGapSeconds: 3 })).toEqual([
      { name: "topic", group: "text" },
    ]);
  });
});

describe("the LLM row", () => {
  it("is required by a thumbnail written by the LLM and not by one from a prompt", () => {
    const base: PlayFormState = {
      ...generated,
      sources: { ...generated.sources, article: "provide" },
      provided: { ...generated.provided, article: "The article." },
      llm: { provider: "", model: "" },
      thumbnailPrompt: "Title card",
      values: { topic: "rope", style: "oil on canvas" },
    };

    const fromPrompt = ask({ ...base, sources: { ...base.sources, thumbnail: "from_prompt" } });
    expect(fromPrompt.result.ok).toBe(true);

    const byLlm = ask({ ...base, sources: { ...base.sources, thumbnail: "prompt_by_llm" } });
    expect(byLlm.blocker?.field).toBe("llm");
    expect(byLlm.blocker?.hint).toBe("Pick an LLM provider and model to play");
  });

  it("is required by an LLM-mode outro even when nothing else asks for one", () => {
    const base: PlayFormState = {
      ...generated,
      sources: { ...generated.sources, article: "provide" },
      provided: { ...generated.provided, article: "The article." },
      llm: { provider: "", model: "" },
      values: { topic: "rope", style: "oil on canvas" },
    };

    expect(ask(base).result.ok).toBe(true);
    expect(ask({ ...base, outro: "Sting" }).blocker?.field).toBe("llm");
  });
});

describe("a provided stage", () => {
  const provided: PlayFormState = {
    ...freshForm,
    title: "Rope Tricks",
    sources: {
      ...freshForm.sources,
      article: "provide",
      audio: "provide",
      images: "provide",
    },
    provided: {
      research: "",
      article: "The article.",
      audio: upload("a1", "audio"),
      images: [upload("i1", "images")],
      thumbnail: undefined,
    },
  };

  it("passes when every stage has its content", () => {
    expect(ask(provided).result.ok).toBe(true);
  });

  it("asks for the paste, then the audio, then the images", () => {
    expect(
      ask({ ...provided, provided: { ...provided.provided, article: "  " } }).blocker?.hint,
    ).toBe("Paste the article to play");
    expect(
      ask({ ...provided, provided: { ...provided.provided, audio: undefined } }).blocker?.hint,
    ).toBe("Attach the narration audio to play");
    expect(ask({ ...provided, provided: { ...provided.provided, images: [] } }).blocker?.hint).toBe(
      "Attach at least one image to play",
    );
  });

  it("waits for a copy that has not finished and points at a failed one first", () => {
    const copying: Upload = { key: "i2", name: "two.png", file: undefined, error: undefined };
    const failed: Upload = { key: "i3", name: "three.png", file: undefined, error: "disk full" };

    expect(
      ask({ ...provided, provided: { ...provided.provided, images: [copying] } }).blocker?.hint,
    ).toBe("Wait for the uploads to finish to play");
    expect(
      ask({ ...provided, provided: { ...provided.provided, images: [copying, failed] } })?.blocker
        ?.hint,
    ).toBe("Remove the upload that failed to play");
  });

  // A provided article forces research off, so the notes are only ever
  // asked for beside an article the run is going to write.
  it("asks for the research notes when research is provided beside a generated article", () => {
    expect(
      ask({ ...generated, sources: { ...generated.sources, research: "provide" } }).blocker?.hint,
    ).toBe("Paste the research notes to play");
  });

  it("asks for the thumbnail image when the thumbnail is provided", () => {
    expect(
      ask({ ...provided, sources: { ...provided.sources, thumbnail: "provide" } }).blocker?.hint,
    ).toBe("Attach the thumbnail image to play");
  });
});

describe("the draft the form posts", () => {
  it("carries the run's configuration and only the keywords it still needs", () => {
    const { draft } = ask({ ...generated, values: { ...generated.values, dropped: "gone" } });

    expect(draft.sources.video).toBe("generate");
    expect(draft.imagePrompts).toEqual([{ name: "Oils", number: 8 }]);
    expect(draft.chunking).toEqual({ mode: "whole" });
    expect(draft.silenceGapSeconds).toBe(3);
    expect(Object.keys(draft.values).sort()).toEqual(["minWords", "style", "topic"]);
  });

  it("names the picked entries with the mode the library saved for them", () => {
    const { draft } = ask({ ...generated, intro: "Cold open", outro: "Sting" });

    expect(draft.intro).toEqual({ name: "Cold open", mode: "text" });
    expect(draft.outro).toEqual({ name: "Sting", mode: "llm" });
  });

  it("leaves an entry out when it is Off", () => {
    const { draft } = ask(generated);

    expect(draft.intro).toBeUndefined();
    expect(draft.outro).toBeUndefined();
  });
});
