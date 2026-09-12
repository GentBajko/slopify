import { expect, it } from "vitest";
import { content } from "./recipe-fixture.js";
import { recipeInputSchema } from "./recipe-input-schema.js";
import { recipe } from "./recipe-model.js";

it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
  "refuses nonfinite local recipe input %s before JSON loses it",
  (value) => {
    expect(() =>
      recipe({ content }, "timing", "video", {
        kind: "local",
        version: 1,
        operation: "automatic-cues-v1",
        values: { duration: value },
      }),
    ).toThrow();
  },
);
it("normalizes optional undefined request settings exactly as their serialized payload", () => {
  const input = {
    kind: "llm" as const,
    version: 1 as const,
    provider: "provider",
    model: "model",
    thinking: "high" as const,
    thinkingConfig: { budget: 1, effort: undefined },
    messages: [{ role: "user" as const, content: "Hello" }],
    webSearch: false,
  };
  expect(recipe({ content }, "article:body", "article", input).requestFingerprint).toBe(
    recipe({ content }, "article:body", "article", { ...input, thinkingConfig: { budget: 1 } })
      .requestFingerprint,
  );
});

it("rejects unsupported persisted local and deferred operations", () => {
  expect(
    recipeInputSchema.safeParse({ kind: "local", version: 1, operation: "typo", values: null })
      .success,
  ).toBe(false);
  expect(
    recipeInputSchema.safeParse({ kind: "deferred", version: 1, operation: "typo", template: null })
      .success,
  ).toBe(false);
});
