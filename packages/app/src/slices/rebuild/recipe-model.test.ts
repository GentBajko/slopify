import { expect, it } from "vitest";
import { content } from "./recipe-fixture.js";
import { recipe } from "./recipe-model.js";

it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
  "refuses nonfinite local recipe input %s before JSON loses it",
  (value) => {
    expect(() =>
      recipe({ content }, "timing", "video", {
        kind: "local",
        version: 1,
        operation: "timing",
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
