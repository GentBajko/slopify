import { describe, expect, it } from "vitest";
import { focusPlayField, playFieldTarget } from "./field-targets";
import { freshForm } from "./state";

describe("exact Play targets", () => {
  it("focuses a literal keyword field without interpreting its name as CSS", () => {
    const root = document.createElement("div");
    const input = document.createElement("input");
    input.dataset.playField = 'values.topic["x"]';
    root.append(input);
    document.body.append(root);
    try {
      expect(focusPlayField(root, 'values.topic["x"]')).toBe(true);
      expect(document.activeElement).toBe(input);
    } finally {
      root.remove();
    }
  });
  it("does not focus missing or disabled controls", () => {
    const root = document.createElement("div");
    const input = document.createElement("input");
    input.dataset.playField = "title";
    input.disabled = true;
    root.append(input);
    expect(focusPlayField(root, "title")).toBe(false);
    expect(focusPlayField(root, "unknown")).toBe(false);
  });
  it.each([
    ["provided.article", "content"],
    ["provided.research", "content"],
    ["sources.research", "content"],
    ["llm.model", "content"],
    ["values.audio", "content"],
    ["provided.audio", "outputs"],
    ["sources.video", "outputs"],
    ["subtitles.fontId", "style"],
    ["expectedWords", "review"],
    ["unknown", "review"],
  ])("maps %s precisely", (field, section) => {
    expect(playFieldTarget(field, freshForm, []).section).toBe(section);
  });
  it("resolves indexed errors to stable identities", () => {
    const form = { ...freshForm, imagePrompts: [{ name: "Maps", number: 0 }] };
    expect(playFieldTarget("imagePrompts.0.number", form, []).field).toBe(
      "imagePrompts.Maps.number",
    );
    expect(playFieldTarget("items.1.values.topic", form, [{ key: "stable" }]).field).toBe(
      "items.stable.values.topic",
    );
  });
});
