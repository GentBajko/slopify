import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { act, cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it } from "vitest";
import { jsonAnswer } from "@/test-app";
import { freshDraftDocument } from "./draft-state";
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

it("summarizes active generated choices with raw counts and exact edit destinations", async () => {
  const harness = reviewHarness();
  await harness.prepare(generated);
  const readiness = screen.getByRole("region", { name: "Run readiness summary" });
  expect(within(readiness).getAllByText("Ready")).toHaveLength(3);
  const outputs = screen.getByRole("region", { name: "Outputs summary" });
  for (const text of [
    "ElevenLabs",
    "eleven_multilingual_v2",
    "Narrator M",
    "Every 03000 characters",
    "Cold open",
    "Sting",
    "fal.ai",
    "fal-ai/flux-2",
    "Oils · 02 images",
    "Maps · 3 images",
    "Title card",
  ])
    expect(within(outputs).getByText(text)).not.toBeNull();
  const content = screen.getByRole("region", { name: "Content summary" });
  expect(within(content).getByText("Claude Code CLI")).not.toBeNull();
  expect(within(content).getByText("high")).not.toBeNull();
  const style = screen.getByRole("region", { name: "Style summary" });
  expect(within(style).getByText("048 px")).not.toBeNull();
  expect(within(style).getByText("upper-middle")).not.toBeNull();
  for (const [label, field] of [
    ["Audio model", "audio.model"],
    ["Chunking", "chunking.characters"],
    ["Oils", "imagePrompts.Oils.number"],
    ["Subtitle position", "subtitles.position"],
    ["Thinking", "llm.thinking"],
  ]) {
    await userEvent.click(screen.getByRole("button", { name: `Edit ${label}` }));
    expect(document.activeElement?.getAttribute("data-play-field")).toBe(field);
    await act(async () => {
      await harness.session().navigate("review");
    });
  }
});

it("explains when a run only uses supplied content", async () => {
  const harness = reviewHarness();
  await harness.prepare(suppliedDocument);
  expect(
    within(screen.getByRole("region", { name: "Run readiness summary" })).getByText(
      "No generated providers required. Supplied content is ready for processing.",
    ),
  ).not.toBeNull();
});

it("links a missing CLI back to the provider control", async () => {
  const harness = reviewHarness();
  await harness.prepare({
    ...generated,
    form: { ...generated.form, llm: { provider: "codex", model: "gpt-5" } },
  });
  const readiness = within(screen.getByRole("region", { name: "Run readiness summary" }));
  expect(readiness.getByText("CLI not found")).not.toBeNull();
  expect(readiness.getByRole("button", { name: "Edit ↗" })).not.toBeNull();
});

it("shows actionable guidance for an installed but incompatible CLI", async () => {
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

  const readiness = within(screen.getByRole("region", { name: "Run readiness summary" }));
  expect(readiness.getByText(issue)).not.toBeNull();
  expect(readiness.getByRole("button", { name: "Edit ↗" })).not.toBeNull();
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
  const outputs = screen.getByRole("region", { name: "Outputs summary" });
  expect(within(outputs).getByText("narration.wav")).not.toBeNull();
  expect(within(outputs).getByText("cover.png")).not.toBeNull();
  expect(
    within(outputs)
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual(["second.png", "first.png"]);
  for (const label of [
    "Audio model",
    "Image model",
    "Chunking",
    "Intro",
    "Outro",
    "Thumbnail prompt",
    "Text model",
    "Thinking",
  ])
    expect(screen.queryByRole("button", { name: `Edit ${label}` })).toBeNull();
});

it("includes text generation for LLM entries and image generation for thumbnails alone", async () => {
  const harness = reviewHarness();
  await harness.prepare({
    ...generated,
    form: {
      ...generated.form,
      sources: { ...suppliedDocument.form.sources, audio: "generate", thumbnail: "prompt_by_llm" },
    },
  });
  expect(screen.getByRole("button", { name: "Edit Text model" })).not.toBeNull();
  expect(screen.getByRole("button", { name: "Edit Image model" })).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Edit Oils" })).toBeNull();
  await act(async () => {
    const document = harness.session().document;
    harness.session().edit({
      ...document,
      form: { ...document.form, sources: { ...document.form.sources, thumbnail: "off" } },
    });
  });
  expect(screen.getByRole("button", { name: "Edit Text model" })).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Edit Image model" })).toBeNull();
});

it.each([
  ["whole", "Whole text", "chunking.mode"],
  ["paragraph", "Paragraph", "chunking.mode"],
  ["words", "Every (not entered) words", "chunking.words"],
] as const)("keeps %s chunking truthful and editable", async (mode, text, field) => {
  const harness = reviewHarness();
  await harness.prepare({
    ...generated,
    form: {
      ...generated.form,
      chunking: { mode, words: "", characters: "3000" },
      imagePrompts: [{ name: "Oils", number: "" }],
    },
  });
  const outputs = screen.getByRole("region", { name: "Outputs summary" });
  expect(within(outputs).getByText(text)).not.toBeNull();
  expect(within(outputs).getByText("Oils · (not entered) images")).not.toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Edit Chunking" }));
  expect(document.activeElement?.getAttribute("data-play-field")).toBe(field);
});

it("uses loaded names while preserving the existing review catalogue refresh", async () => {
  const harness = reviewHarness();
  await harness.prepare(generated);
  await userEvent.click(screen.getByRole("button", { name: "Edit Audio model" }));
  await screen.findByRole("option", { name: "Multilingual v2" });
  await screen.findByRole("option", { name: "FLUX.2" });
  await act(async () => {
    await harness.session().navigate("style");
  });
  await screen.findByRole("option", { name: "Default · bundled" });
  const requests = harness.requests.length;
  await act(async () => {
    await harness.session().navigate("review");
  });
  expect(screen.getByText("Multilingual v2")).not.toBeNull();
  expect(screen.getByText("FLUX.2")).not.toBeNull();
  expect(
    within(screen.getByRole("region", { name: "Style summary" })).getByText("Default"),
  ).not.toBeNull();
  expect(
    harness.requests
      .slice(requests)
      .filter((request) => /\/providers\/[^/]+\/models/.test(new URL(request.url).pathname)),
  ).toHaveLength(2);
});
