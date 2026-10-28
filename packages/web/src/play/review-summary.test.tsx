import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { act, cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it } from "vitest";
import { jsonAnswer } from "@/test-app";
import { freshDraftDocument } from "./draft-state";
import { openRow, summaryTitle } from "./play-test-fixture";
import { reviewHarness, reviewStorage, suppliedDocument } from "./review-test-harness";

beforeEach(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, value: reviewStorage() });
});
afterEach(cleanup);
const generated: PlayDraftDocument = {
  ...freshDraftDocument,
  form: {
    ...freshDraftDocument.form,
    title: "Generated setup",
    articlePrompt: "Dossier",
    llm: { provider: "claude-code", model: "sonnet", thinking: "high" },
    audio: { provider: "elevenlabs", model: "eleven_multilingual_v2", voice: "eleven-narrator" },
    images: { provider: "fal", model: "fal-ai/flux-2" },
    imagePrompts: [
      { name: "Oils", number: "02" },
      { name: "Maps", number: "3" },
    ],
    thumbnailPrompt: "Title card",
    sources: { ...freshDraftDocument.form.sources, thumbnail: "from_prompt" },
    intro: "Cold open",
    outro: "Sting",
    chunking: { mode: "characters", words: "500", characters: "03000" },
    subtitles: {
      ...freshDraftDocument.form.subtitles,
      mode: "burn-in",
      position: "upper-middle",
      fontSize: "048",
    },
  },
};

const region = (name: string) => screen.getByRole("region", { name: `${name} summary` });

it("summarizes the run in the rows' own groups, with one Change per group", async () => {
  const harness = reviewHarness();
  await harness.prepare(generated);
  const narration = region("Narration");
  // The Narration and Images rows open on Create load their model lists, so the summary names
  // the models once they have arrived, and their ids until then.
  expect(within(narration).getByText(/^(eleven_multilingual_v2|Multilingual v2)$/)).not.toBeNull();
  for (const text of ["ElevenLabs", "Narrator M", "Every 03000 characters", "Cold open", "Sting"])
    expect(within(narration).getByText(text)).not.toBeNull();
  const images = region("Images");
  expect(within(images).getByText(/^(fal-ai\/flux-2|FLUX\.2)$/)).not.toBeNull();
  for (const text of ["fal.ai", "02 images", "3 images"])
    expect(within(images).getByText(text)).not.toBeNull();
  expect(within(region("Extras")).getByText("Title card")).not.toBeNull();
  const article = region("Article");
  expect(within(article).getByText("Claude Code CLI")).not.toBeNull();
  expect(within(article).getByText("High")).not.toBeNull();
  const style = region("Video and style");
  expect(within(style).getByText("048 px")).not.toBeNull();
  expect(within(style).getByText("upper-middle")).not.toBeNull();
  // One Change per group, each opening its row on the form and closing the summary.
  for (const [name, field] of [
    ["Change article", "sources.article"],
    ["Change narration", "sources.audio"],
    ["Change images", "sources.images"],
    ["Change video and style", "format"],
  ] as const) {
    const summary = screen.getByRole("dialog", { name: summaryTitle });
    await userEvent.click(within(summary).getByRole("button", { name }));
    expect(document.activeElement?.getAttribute("data-play-field")).toBe(field);
    expect(screen.queryByRole("dialog", { name: summaryTitle })).toBeNull();
    await act(async () => {
      await harness.session().navigate("review");
    });
  }
});

// What a group says a stage's choice is, read beside its label.
const said = (group: string, label: string) =>
  within(region(group)).getByText(label, { selector: "dt" }).nextElementSibling?.textContent;

it.each([
  [
    "everything generated",
    generated,
    {
      Article: "Write it for me",
      Research: "Off",
      Narration: "AI voice (paid per character)",
      Images: "Made by AI (paid)",
      Video: "On (free)",
      Thumbnail: "From my thumbnail prompt",
    },
  ],
  [
    "everything supplied",
    suppliedDocument,
    {
      Article: "Use my text as written",
      Narration: "Off",
      Images: "None",
      Thumbnail: "None",
    },
  ],
] as const)(
  "names each stage's choice in its row's own words (%s)",
  async (_name, document, words) => {
    const harness = reviewHarness();
    await harness.prepare(document);
    const groups: Readonly<Record<string, string>> = {
      Article: "Article",
      Research: "Article",
      Narration: "Narration",
      Images: "Images",
      Video: "Video and style",
      Thumbnail: "Extras",
    };
    for (const [label, expected] of Object.entries(words))
      expect([label, said(groups[label] ?? label, label)]).toEqual([label, expected]);
  },
);

it("says nothing is missing when a run only uses supplied content", async () => {
  const harness = reviewHarness();
  await harness.prepare(suppliedDocument);
  const missing = screen.getByRole("region", { name: "Before you can start" });
  expect(within(missing).getByRole("heading", { name: "Nothing is missing" })).not.toBeNull();
  expect(within(missing).queryByRole("list")).toBeNull();
});

it("lists a picked service that will not answer, and goes to its control", async () => {
  const harness = reviewHarness();
  await harness.prepare({
    ...generated,
    form: { ...generated.form, llm: { provider: "codex", model: "gpt-5" } },
  });
  const missing = within(screen.getByRole("region", { name: "Before you can start" }));
  const fix = missing.getByRole("button", { name: /Codex CLI isn't installed on this computer/ });
  await userEvent.click(fix);
  expect(document.activeElement?.getAttribute("data-play-field")).toBe("llm.provider");
});

it("says what is wrong with an installed but incompatible CLI, in its own words", async () => {
  const issue =
    "Codex CLI 0.149.1 or newer is required; version 0.148.0 is installed. Update Codex CLI and try again.";
  const harness = reviewHarness(undefined, {
    "GET /api/providers": jsonAnswer({
      providers: [
        {
          id: "codex",
          family: "llm",
          displayName: "Codex CLI",
          readiness: { kind: "cli", installed: true, version: "0.148.0", issue },
        },
        {
          id: "elevenlabs",
          family: "tts",
          displayName: "ElevenLabs",
          readiness: { kind: "keyed", hasKey: true },
        },
        {
          id: "fal",
          family: "image",
          displayName: "fal.ai",
          readiness: { kind: "keyed", hasKey: true },
        },
      ],
    }),
  });
  await harness.prepare({
    ...generated,
    form: { ...generated.form, llm: { provider: "codex", model: "gpt-5" } },
  });

  const missing = within(screen.getByRole("region", { name: "Before you can start" }));
  expect(
    missing.getByRole("button", { name: new RegExp(issue.replace(/[.()]/g, "\\$&")) }),
  ).not.toBeNull();
});

it("shows supplied filenames in order and hides dormant generation choices", async () => {
  const harness = reviewHarness();
  await harness.prepare({
    ...generated,
    form: {
      ...generated.form,
      sources: {
        research: "off",
        article: "provide",
        audio: "provide",
        images: "provide",
        thumbnail: "provide",
        video: "generate",
      },
      provided: {
        ...generated.form.provided,
        article: "Supplied text",
        audio: { attachmentId: crypto.randomUUID(), name: "narration.wav" },
        thumbnail: { attachmentId: crypto.randomUUID(), name: "cover.png" },
        images: [
          { attachmentId: crypto.randomUUID(), name: "second.png" },
          { attachmentId: crypto.randomUUID(), name: "first.png" },
        ],
      },
    },
  });
  expect(within(region("Narration")).getByText("narration.wav")).not.toBeNull();
  expect(within(region("Extras")).getByText("cover.png")).not.toBeNull();
  expect(
    within(region("Images"))
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual(["second.png", "first.png"]);
  for (const label of [
    "Voice model",
    "Image model",
    "Split the narration",
    "Intro",
    "Outro",
    "Thumbnail prompt",
    "Model",
    "Thinking",
  ])
    expect(screen.queryByText(label, { selector: "dt" })).toBeNull();
});

it("includes the writer for AI-written entries and the image service for thumbnails alone", async () => {
  const harness = reviewHarness();
  await harness.prepare({
    ...generated,
    form: {
      ...generated.form,
      sources: { ...suppliedDocument.form.sources, audio: "generate", thumbnail: "prompt_by_llm" },
    },
  });
  expect(within(region("Article")).getByText("Written by", { selector: "dt" })).not.toBeNull();
  expect(within(region("Images")).getByText("Image model", { selector: "dt" })).not.toBeNull();
  expect(within(region("Images")).queryByText("Oils", { selector: "dt" })).toBeNull();
  await act(async () => {
    const document = harness.session().document;
    harness.session().edit({
      ...document,
      form: { ...document.form, sources: { ...document.form.sources, thumbnail: "off" } },
    });
  });
  expect(within(region("Article")).getByText("Written by", { selector: "dt" })).not.toBeNull();
  expect(within(region("Images")).queryByText("Image model", { selector: "dt" })).toBeNull();
});

it.each([
  ["whole", "Read as one piece"],
  ["paragraph", "By paragraph"],
  ["words", "Every (not entered) words"],
] as const)("keeps %s chunking truthful", async (mode, text) => {
  const harness = reviewHarness();
  await harness.prepare({
    ...generated,
    form: {
      ...generated.form,
      chunking: { mode, words: "", characters: "3000" },
      imagePrompts: [{ name: "Oils", number: "" }],
    },
  });
  expect(within(region("Narration")).getByText(text)).not.toBeNull();
  expect(within(region("Images")).getByText("(not entered) images")).not.toBeNull();
});

it("uses loaded names while preserving the existing review catalogue refresh", async () => {
  const harness = reviewHarness();
  await harness.prepare(generated);
  await userEvent.click(
    within(screen.getByRole("dialog", { name: summaryTitle })).getByRole("button", {
      name: "Change narration",
    }),
  );
  await screen.findByRole("option", { name: "Multilingual v2" });
  await openRow("Images");
  await screen.findByRole("option", { name: "FLUX.2" });
  await act(async () => {
    await harness.session().navigate("style");
  });
  await screen.findByRole("option", { name: "Default · bundled" });
  const requests = harness.requests.length;
  await act(async () => {
    await harness.session().navigate("review");
  });
  expect(within(region("Narration")).getByText("Multilingual v2")).not.toBeNull();
  expect(within(region("Images")).getByText("FLUX.2")).not.toBeNull();
  expect(within(region("Video and style")).getByText("Default")).not.toBeNull();
  const refreshed = harness.requests
    .slice(requests)
    .map((request) => new URL(request.url).pathname)
    .filter((path) => /\/providers\/[^/]+\/models/.test(path));
  expect(refreshed).toEqual(
    expect.arrayContaining(["/api/providers/elevenlabs/models", "/api/providers/fal/models"]),
  );
});

it.each([
  ["a draft saved without the PDF stage", generated, "No"],
  [
    "a generated Document",
    {
      ...generated,
      form: {
        ...generated.form,
        sources: { ...generated.form.sources, document: "generate" as const },
        document: { theme: "plain" as const },
      },
    },
    "Plain look",
  ],
])("names the PDF for %s", async (_name, document, expected) => {
  const harness = reviewHarness();
  await harness.prepare(document);
  const label = within(region("Extras")).getByText("PDF");
  expect(label.nextElementSibling?.textContent).toBe(expected);
});

it.each([
  ["a draft saved without the YouTube description", generated, "No"],
  [
    "the built-in prompt",
    { ...generated, form: { ...generated.form, youtubeDescription: true } },
    "Built-in prompt · one AI call after the captions are timed",
  ],
  [
    "a picked prompt",
    {
      ...generated,
      form: { ...generated.form, youtubeDescription: true, descriptionPrompt: "Hooky" },
    },
    "Hooky prompt · one AI call after the captions are timed",
  ],
])("names the YouTube description for %s", async (_name, document, expected) => {
  const harness = reviewHarness();
  await harness.prepare(document);
  const label = within(region("Extras")).getByText("YouTube description");
  expect(label.nextElementSibling?.textContent).toBe(expected);
});

const shorts = {
  enabled: true,
  count: "3",
  minSeconds: "60",
  maxSeconds: "120",
  prompt: "",
  imagePrompt: "",
};

it.each([
  ["a draft saved without Shorts", generated, "No"],
  [
    "the built-in prompts",
    { ...generated, form: { ...generated.form, shorts } },
    "3 shorts of 60-120 s · Built-in prompt · Built-in image prompt · Portrait images, made after the captions are timed",
  ],
  [
    "picked prompts",
    {
      ...generated,
      form: { ...generated.form, shorts: { ...shorts, prompt: "Hooks", imagePrompt: "Maps" } },
    },
    "3 shorts of 60-120 s · Hooks prompt · Maps image prompt · Portrait images, made after the captions are timed",
  ],
  [
    "the more options",
    {
      ...generated,
      form: {
        ...generated.form,
        shorts: {
          ...shorts,
          titleOnScreen: true,
          speed: "1.10",
          musicVolume: "20",
          fullVideoLink: "https://youtu.be/x",
        },
      },
    },
    "3 shorts of 60-120 s · Built-in prompt · Built-in image prompt · Title on screen · 1.10× speed · Music at 20% once added in Edit settings · Links https://youtu.be/x · Portrait images, made after the captions are timed",
  ],
  [
    "attached background music",
    {
      ...generated,
      form: {
        ...generated.form,
        shorts,
        provided: {
          ...generated.form.provided,
          shortsMusic: { attachmentId: "00000000-0000-4000-8000-0000000000aa", name: "bed.mp3" },
        },
      },
    },
    "3 shorts of 60-120 s · Built-in prompt · Built-in image prompt · Music: bed.mp3 at 15% · Portrait images, made after the captions are timed",
  ],
])("names the Shorts for %s", async (_name, document, expected) => {
  const harness = reviewHarness();
  await harness.prepare(document);
  const label = within(region("Extras")).getByText("Shorts");
  expect(label.nextElementSibling?.textContent).toBe(expected);
});

it.each([
  { thumbnail: "from_prompt", says: "Cast sheet · thumbnail too" },
  { thumbnail: "off", says: "Cast sheet" },
] as const)(
  "says the establishing image guides the thumbnail only while one is drawn ($thumbnail)",
  async ({ thumbnail, says }) => {
    const harness = reviewHarness();
    await harness.prepare({
      ...generated,
      form: {
        ...generated.form,
        sources: { ...generated.form.sources, thumbnail },
        reference: { source: "prompt", prompt: "Cast sheet", thumbnail: true },
      },
    });
    // The establishing image is read in the Images group, where its row is.
    expect(within(region("Images")).getByText(says)).not.toBeNull();
  },
);
