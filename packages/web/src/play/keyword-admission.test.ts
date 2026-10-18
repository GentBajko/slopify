import type { Entry, Prompt } from "@app/slices/library/model.js";
import { describe, expect, it } from "vitest";
import { admission } from "@/play/admission";
import { placedBodies } from "@/play/placed-bodies";
import type { PlayFormState } from "@/play/state";
import { draftOf, freshForm, llmUsesOf, needsLlm } from "@/play/state";
import { playFieldTarget } from "./field-targets";

function prompt(kind: Prompt["kind"], name: string, body: string): Prompt {
  return { id: name, kind, name, body, slots: [], updatedAt: "2026-09-03T00:00:00.000Z" };
}

const entries: readonly Entry[] = [
  {
    id: "i",
    category: "intro",
    mode: "text",
    name: "Cold open",
    body: "Welcome to {{Slopify_Channel}}.",
    slots: [],
    updatedAt: "2026-09-03T00:00:00.000Z",
  },
];

const base: readonly Prompt[] = [
  prompt("article", "Dossier", "Write about rope for {{Slopify_Channel}}."),
  prompt("image", "Oils", "An oil painting."),
  prompt("thumbnail", "Card", "A title card."),
];

const generated: PlayFormState = {
  ...freshForm,
  title: "Rope Tricks",
  sources: { ...freshForm.sources, article: "generate", images: "generate" },
  llm: { provider: "claude-code", model: "sonnet" },
  audio: { provider: "elevenlabs", model: "eleven_multilingual_v2", voice: "Narrator" },
  images: { provider: "fal", model: "fal-ai/flux-2" },
  articlePrompt: "Dossier",
  imagePrompts: [{ name: "Oils", number: 8 }],
  values: {},
};

function ask(form: PlayFormState, prompts: readonly Prompt[] = base) {
  return admission({ form, prompts, entries, silenceGapSeconds: 3 });
}

function withBody(kind: Prompt["kind"], name: string, body: string): readonly Prompt[] {
  return base.map((one) => (one.kind === kind && one.name === name ? { ...one, body } : one));
}

describe("keywords Slopify fills on Play", () => {
  it("lets a run through whose keywords are all usable where they are", () => {
    const { result, fields } = ask(generated);
    expect(result.ok).toBe(true);
    expect(fields).toEqual([]);
  });

  it("refuses a keyword where it can't be filled, on the field that picked the prompt", () => {
    const prompts = withBody("article", "Dossier", "Recap {{Slopify_Summary}}.");
    const { result, blocker } = ask(generated, prompts);
    expect(result.ok).toBe(false);
    const refusal = result.ok
      ? undefined
      : result.fields.find((one) => one.field === "articlePrompt");
    expect(refusal?.message).toContain("can't be used in an Article prompt");
    expect(refusal?.message).toContain("Change the prompt in Library, or pick another one.");
    expect(blocker).toEqual({
      field: "articlePrompt",
      hint: "Remove {{Slopify_Summary}} from that prompt, or pick another, to play",
    });
  });

  // Play draws no field for a keyword Slopify fills, so it sends no value of its own for one.
  it("sends no value for a keyword Slopify fills, so a misplaced one stays refused", () => {
    const prompts = withBody("article", "Dossier", "Recap {{Slopify_Summary}}.");
    const { result, draft } = ask({ ...generated, values: { Slopify_Summary: "mine" } }, prompts);
    expect(draft.values).toEqual({});
    expect(result.ok).toBe(false);
  });

  it("marks the picked image prompt, by its index, like the server", () => {
    const prompts = [...base, prompt("image", "Late", "{{Slopify_Duration}}")];
    const { result } = ask(
      {
        ...generated,
        imagePrompts: [
          { name: "Oils", number: 2 },
          { name: "Late", number: 2 },
        ],
      },
      prompts,
    );
    expect(result.ok ? [] : result.fields.map((one) => one.field)).toContain("imagePrompts.1.name");
  });

  it("refuses a keyword in the title, with a hint to take it out", () => {
    const { result, blocker } = ask({ ...generated, title: "{{Slopify_Title}} again" });
    expect(result.ok).toBe(false);
    expect(blocker).toEqual({
      field: "title",
      hint: "Remove {{Slopify_Title}} from the title to play",
    });
  });

  it("needs the text model for the digest and the scenes, and says what for", () => {
    const prompts = withBody("image", "Oils", "{{Slopify_Hook}} at {{Slopify_Setting}}");
    const form: PlayFormState = {
      ...generated,
      sources: { ...generated.sources, article: "provide", audio: "off", video: "off" },
      provided: { ...generated.provided, article: "Exact words." },
      llm: { provider: "", model: "" },
    };
    expect(needsLlm(form, entries)).toBe(false);
    expect(needsLlm(form, entries, prompts)).toBe(true);
    expect(llmUsesOf(form, entries, prompts).map((use) => use.label)).toEqual([
      "writing image scenes",
      "writing the keyword digest",
    ]);
    expect(ask(form, prompts).blocker?.field).toBe("llm");
    expect(playFieldTarget("llm", form, [], entries, prompts).section).not.toBe("content");
  });

  it("refuses the article-made keywords with Article Off, pointing at Article", () => {
    const prompts = withBody("thumbnail", "Card", "Words: {{Slopify_Thumbnail_Text}}");
    const form: PlayFormState = {
      ...generated,
      sources: {
        ...generated.sources,
        research: "off",
        article: "off",
        audio: "off",
        images: "off",
        video: "off",
        thumbnail: "from_prompt",
      },
      thumbnailPrompt: "Card",
    };
    const { result, blocker } = ask(form, prompts);
    expect(result.ok).toBe(false);
    expect(blocker).toEqual({
      field: "thumbnailPrompt",
      hint: "Set Article to Generate or Provide to play",
    });
  });
});

describe("placedBodies", () => {
  it("places every picked body as pickTemplates does, with the field that picked it", () => {
    const prompts = [
      ...base,
      prompt("script", "Turns", "x"),
      prompt("narration", "Calm", "x"),
      prompt("description", "Desc", "x"),
      prompt("shorts", "Cuts", "x"),
      prompt("image", "Vertical", "x"),
      prompt("image", "Wide", "x"),
      prompt("review", "Strict", "x"),
    ];
    const form: PlayFormState = {
      ...generated,
      sources: { ...generated.sources, audio: "generate", thumbnail: "from_prompt" },
      audio: { provider: "inworld", model: "inworld-tts-2", voice: "v" },
      narrationPrompt: "Calm",
      intro: "Cold open",
      thumbnailPrompt: "Card",
      youtubeDescription: true,
      descriptionPrompt: "Desc",
      reference: { source: "prompt", prompt: "Wide", thumbnail: false },
    };
    const draft = draftOf({ form, entries, slots: [], silenceGapSeconds: 3 });
    const placed = placedBodies(draft, prompts, entries);
    expect(placed.map((one) => [one.field, one.place])).toEqual(
      expect.arrayContaining([
        ["articlePrompt", "article"],
        ["narrationPrompt", "narration"],
        ["intro", "intro"],
        ["descriptionPrompt", "description"],
        ["reference.prompt", "image"],
        ["imagePrompts.0.name", "image"],
        ["thumbnailPrompt", "thumbnail"],
      ]),
    );
    expect(
      placedBodies(
        { ...draft, imagePrompts: [{ name: "Gone", number: 1 }] },
        prompts,
        entries,
      ).some((one) => one.field === "imagePrompts.0.name"),
    ).toBe(false);
  });
});
