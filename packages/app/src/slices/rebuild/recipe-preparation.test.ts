import { expect, it } from "vitest";
import { config, emptyView, workFor } from "./recipe-fixture.js";

it("waits for source-bound preparation before materializing TTS", () => {
  const selected = {
    ...config,
    narrationPrompt: "Documentary",
    rendered: { ...config.rendered, narration: "Restrained delivery." },
    chunking: { mode: "whole" as const },
    sources: { ...config.sources, audio: "generate" as const },
    audio: { provider: "inworld", model: "inworld-tts-2", voice: "voice" },
  };
  const plan = workFor(emptyView(selected));
  expect(
    plan.recipes.filter((row) => row.stage === "audio" && row.input.kind === "llm"),
  ).toHaveLength(1);
  expect(plan.recipes.some((row) => row.input.kind === "tts")).toBe(false);
  expect(plan.recipes.some((row) => row.key === "audio:body:future")).toBe(true);
});

it("keeps old recipes identical with an absent or blank selection", () => {
  const selected = { ...config, sources: { ...config.sources, audio: "generate" as const } };
  const before = workFor(emptyView(selected)).recipes;
  expect(workFor(emptyView({ ...selected, narrationPrompt: "" })).recipes).toEqual(before);
});
