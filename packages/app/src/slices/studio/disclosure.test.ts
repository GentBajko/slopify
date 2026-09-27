import { describe, expect, it } from "vitest";
import { aiDisclosureOf, type DisclosureInput } from "./disclosure.js";

const base: DisclosureInput = {
  setting: "auto",
  kind: "video",
  audio: "provide",
  images: "provide",
  animated: false,
};

describe("aiDisclosureOf", () => {
  it("says Yes for an AI voice, AI images or AI animation, naming each", () => {
    expect(aiDisclosureOf({ ...base, audio: "generate" })).toEqual({
      altered: true,
      why: "Yes because an AI voice narrates it, and YouTube asks for this when AI makes a voice or a scene that could pass as real.",
    });
    expect(aiDisclosureOf({ ...base, images: "generate" }).why).toContain(
      "its images are drawn by an AI image model",
    );
    expect(aiDisclosureOf({ ...base, animated: true }).altered).toBe(true);
    expect(
      aiDisclosureOf({ ...base, audio: "generate", images: "generate", animated: true }).why,
    ).toContain(
      "an AI voice narrates it, its images are drawn by an AI image model and some images are animated by AI",
    );
  });

  it("says No only when the narration and the images are the user's own or absent", () => {
    expect(aiDisclosureOf(base).altered).toBe(false);
    expect(aiDisclosureOf({ ...base, audio: "off", images: "off" }).altered).toBe(false);
  });

  it("says Yes for every short, whose images are always drawn by the image model", () => {
    expect(aiDisclosureOf({ ...base, kind: "short" }).altered).toBe(true);
  });

  it("follows the channel's Always Yes or Always No over the rule", () => {
    expect(aiDisclosureOf({ ...base, setting: "yes" })).toMatchObject({ altered: true });
    expect(aiDisclosureOf({ ...base, setting: "yes" }).why).toContain("Always Yes");
    const no = aiDisclosureOf({ ...base, setting: "no", audio: "generate", kind: "short" });
    expect(no.altered).toBe(false);
    expect(no.why).toContain("Always No");
  });
});
