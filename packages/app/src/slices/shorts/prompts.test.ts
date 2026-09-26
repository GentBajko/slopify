import { expect, it } from "vitest";
import { checkImagePrompts, imagePromptMessages } from "./prompts.js";

it("asks for exactly one vertical image prompt per stretch of the clip, in the given style", () => {
  const [system, user] = imagePromptMessages({
    style: "Oil paintings.",
    videoTitle: "Harbors",
    shortTitle: "Why boats float",
    text: "Boats float because they push water aside.",
    count: 3,
    imageSeconds: 15,
  });
  expect(system?.content).toContain("Exactly 3 prompts, one per image");
  expect(system?.content).toContain("about 15 seconds");
  expect(system?.content).toContain("vertical (9:16)");
  expect(user?.content).toContain("Oil paintings.");
  expect(user?.content).toContain("Short: Why boats float");
  expect(user?.content).toContain("Boats float because they push water aside.");
});

it("accepts exactly the number of prompts asked for, and says what was wrong otherwise", () => {
  expect(checkImagePrompts('```json\n["A harbor", " Boats\\nleaving "]\n```', 2)).toEqual({
    ok: true,
    prompts: ["A harbor", "Boats leaving"],
  });
  expect(checkImagePrompts('["A harbor"]', 2)).toEqual({
    ok: false,
    reason:
      "The AI model wrote 1 image prompts for a short that needs exactly 2. Retry stage, or choose another model in Edit project → Providers.",
  });
  expect(checkImagePrompts('["A harbor", ""]', 2)).toMatchObject({ ok: false });
  expect(checkImagePrompts("Here are some ideas.", 2)).toEqual({
    ok: false,
    reason:
      "The AI model's image prompts for a short didn't come back in the expected format (a JSON list of prompts). Retry stage, or choose another model in Edit project → Providers.",
  });
});
