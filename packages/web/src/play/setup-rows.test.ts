import type { ProviderStatus, Voice } from "@app/slices/settings/model.js";
import { defaultVideoEdit } from "@app/slices/video/edit-settings.js";
import { describe, expect, it } from "vitest";
import { lookWords, rowLabel, rowSummary, type SummaryContext, setupRows } from "./setup-rows";
import { freshForm, type PlayFormState } from "./state";

const providers: readonly ProviderStatus[] = [
  {
    id: "claude-code",
    family: "llm",
    displayName: "Claude Code CLI",
    readiness: { kind: "cli", installed: true, version: "2.1.258" },
  },
  {
    id: "openai-tts",
    family: "tts",
    displayName: "OpenAI",
    readiness: { kind: "keyed", hasKey: true },
  },
  { id: "fal", family: "image", displayName: "fal.ai", readiness: { kind: "keyed", hasKey: true } },
];
const voices: readonly Voice[] = [
  { id: "v1", provider: "openai-tts", name: "History narrator", voiceId: "sage" },
];
const names: Readonly<Record<string, string>> = { sonnet: "Sonnet 5.5", "fal-ai/flux-2": "FLUX.2" };
const context: SummaryContext = {
  providers,
  voices,
  keywords: [],
  topics: [],
  channel: "My channel",
  brandKit: true,
  fontName: "Barlow",
  reviews: 0,
  kind: "video",
  modelName: (_provider, model) => names[model],
};
const form: PlayFormState = {
  ...freshForm,
  articlePrompt: "History · Documentary",
  llm: { provider: "claude-code", model: "sonnet" },
  audio: { ...freshForm.audio, provider: "openai-tts", model: "gpt-4o-mini-tts", voice: "sage" },
  images: { provider: "fal", model: "fal-ai/flux-2" },
  imagePrompts: [
    { name: "Oils", number: 2 },
    { name: "Maps", number: 3 },
  ],
};
const summary = (row: Parameters<typeof rowSummary>[0], over: Partial<PlayFormState> = {}) =>
  rowSummary(row, { ...form, ...over }, context);

describe("each setup row's one sentence", () => {
  it("says who writes the article, from which prompt, and with what research", () => {
    expect(summary("article", { sources: { ...form.sources, research: "generate" } })).toBe(
      "Written by Claude Code CLI (Sonnet 5.5) from the “History · Documentary” prompt, with web research.",
    );
    expect(summary("article", { articlePrompt: "", llm: { provider: "", model: "" } })).toBe(
      "No article prompt picked yet. No writing service picked yet.",
    );
    expect(summary("article", { sources: { ...form.sources, article: "provide" } })).toBe(
      "Your own text, used as written.",
    );
  });

  it("names the voice and its service, or what is still to pick", () => {
    expect(summary("narration")).toBe("Read by History narrator, an OpenAI voice.");
    expect(summary("narration", { intro: "Cold open" })).toBe(
      "Read by History narrator, an OpenAI voice, with the “Cold open” intro.",
    );
    expect(summary("narration", { audio: { ...form.audio, provider: "" } })).toBe(
      "No voice service picked yet.",
    );
    expect(summary("narration", { sources: { ...form.sources, audio: "off" } })).toBe(
      "None: a silent video.",
    );
  });

  it("counts the images, names their prompts and who draws them", () => {
    expect(summary("images")).toBe("5 images from “Oils” and “Maps”, made by fal.ai (FLUX.2).");
    expect(summary("images", { imagePrompts: [] })).toBe("No image prompt ticked yet.");
    expect(summary("images", { images: { provider: "", model: "" } })).toBe(
      "5 images from “Oils” and “Maps”. No image service picked yet.",
    );
  });

  it("says the shape, the cuts, the look and the captions in words", () => {
    expect(summary("video", { videoEdit: defaultVideoEdit })).toBe(
      "Landscape 16:9, a new image at each sentence, no effects, no captions.",
    );
    expect(
      summary("video", {
        format: "9:16",
        subtitles: { ...form.subtitles, mode: "burn-in" },
        videoEdit: { ...defaultVideoEdit, transition: "crossfade", transitionSeconds: 1 },
      }),
    ).toBe("Portrait 9:16, a new image at each sentence, a 1 s crossfade, captions in Barlow.");
  });

  it("lists what else is made, and says so when it is the video only", () => {
    expect(summary("outputs")).toBe("The video only: no thumbnail, description, shorts or PDF.");
    expect(
      summary("outputs", {
        sources: { ...form.sources, thumbnail: "from_prompt" },
        youtubeDescription: true,
        shorts: {
          enabled: true,
          count: "2",
          minSeconds: "45",
          maxSeconds: "90",
          prompt: "",
          imagePrompt: "",
        },
      }),
    ).toBe("Also makes a thumbnail, 2 shorts and a YouTube description.");
  });

  it("says where the run pauses for approval and what an AI checks", () => {
    expect(summary("reviews")).toBe(
      "Runs straight through: no pauses for your approval, no AI checks.",
    );
    expect(
      rowSummary(
        "reviews",
        { ...form, checkpoints: ["audio", "video"] },
        { ...context, reviews: 1 },
      ),
    ).toBe("Pauses for your approval before narration and video; an AI checks 1 step.");
  });

  it("shows a title pattern and the keywords asked for, never a bare keyword in braces", () => {
    const keywords = { ...context, keywords: ["Topic", "era"], topics: ["Topic"] };
    expect(rowSummary("title", { ...form, title: "History: {{Topic}}" }, keywords)).toBe(
      "Title: “History: …”. Asks for: era.",
    );
    expect(rowSummary("title", { ...form, title: "{{Topic}}" }, keywords)).toBe("Asks for: era.");
  });

  it("names the channel and whether its brand kit fills the defaults", () => {
    expect(summary("channel")).toBe(
      "For My channel, with its brand kit (fonts, intro, outro and sounds).",
    );
  });

  it("joins nothing with dots and leaves no keyword in braces", () => {
    // A prompt's own name may hold a dot ("History · Documentary"); the sentence adds none.
    for (const row of setupRows.map((one) => one.id)) {
      const line = summary(row, { articlePrompt: "Documentary" });
      expect(line).not.toMatch(/ · |\{\{/);
      expect(line.endsWith(".")).toBe(true);
    }
  });
});

describe("row names", () => {
  it("names the Video and style row for what is being made", () => {
    expect(rowLabel("video")).toBe("Video and style");
    expect(rowLabel("video", "podcast")).toBe("Sound and captions");
    expect(rowLabel("video", "images")).toBe("Shape and look");
    expect(rowLabel("reviews")).toBe("Pauses and checks");
    expect(rowLabel("outputs")).toBe("Extras");
  });
});

describe("the look in words", () => {
  it("names only what differs from plain cuts, and animated images as paid", () => {
    expect(lookWords(defaultVideoEdit)).toBe("no effects");
    expect(
      lookWords({
        ...defaultVideoEdit,
        vignette: "subtle",
        grade: "sepia",
        atmosphere: "fog",
        animate: "every",
        animateEvery: 3,
      }),
    ).toBe("a subtle vignette, a sepia grade, drifting fog and every 3rd image animated (paid)");
  });
});
