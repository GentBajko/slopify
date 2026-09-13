import type { Entry, Prompt } from "@app/slices/library/model.js";
import { expect, it } from "vitest";
import { templateLibrary } from "./template-library";

it("preserves saved bodies after library changes and retains distinct kinds and categories", () => {
  const prompt: Prompt = {
    id: "saved",
    kind: "article",
    name: "Shared",
    body: "Saved {topic}",
    slots: ["topic"],
    updatedAt: "then",
  };
  const entry: Entry = {
    id: "entry",
    category: "intro",
    mode: "text",
    name: "Opening",
    body: "Saved intro",
    slots: [],
    updatedAt: "then",
  };
  const image: Prompt = { ...prompt, id: "image", kind: "image" };
  const outro: Entry = { ...entry, id: "outro", category: "outro" };
  expect(
    templateLibrary(
      { prompts: [prompt], entries: [entry] },
      [{ ...prompt, name: "shared", body: "Changed" }, image],
      [{ ...entry, name: "opening", body: "Changed" }, outro],
    ),
  ).toEqual({ prompts: [prompt, image], entries: [entry, outro] });
  expect(templateLibrary({ prompts: [prompt], entries: [entry] }, [], [])).toEqual({
    prompts: [prompt],
    entries: [entry],
  });
});
