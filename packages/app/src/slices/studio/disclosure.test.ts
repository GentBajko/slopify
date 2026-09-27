import { describe, expect, it } from "vitest";
import { aiDisclosureOf, type DisclosureInput } from "./disclosure.js";

// An AI narrator and AI pictures, none of them marked: every project's usual make-up.
const base: DisclosureInput = {
  setting: "auto",
  kind: "video",
  realPersonVoices: [],
  realFootage: false,
  photorealistic: false,
};

describe("aiDisclosureOf", () => {
  it("says No when none of YouTube's three cases applies, and says so in plain words", () => {
    const answer = aiDisclosureOf(base);
    expect(answer.altered).toBe(false);
    expect(answer.why).toContain("none of YouTube's three AI use cases applies");
    expect(answer.why).toContain("Settings → Voices");
    expect(answer.why).toContain("Library → Prompts");
    expect(aiDisclosureOf({ ...base, kind: "short" }).altered).toBe(false);
  });

  it("says Yes for a voice marked as imitating a real person, naming it and case 1", () => {
    expect(aiDisclosureOf({ ...base, realPersonVoices: ["Anna clone"] })).toEqual({
      altered: true,
      why: `Yes because the narration uses the voice "Anna clone", marked in Settings → Voices as imitating a real person (YouTube's case 1: "Makes a real person appear to say or do something they didn't say or do"). Selecting Yes adds YouTube's AI label.`,
    });
    expect(aiDisclosureOf({ ...base, kind: "short", realPersonVoices: ["A", "B"] }).why).toContain(
      'the voices "A" and "B"',
    );
  });

  it("says Yes for real footage under an atmosphere overlay, but not for colour alone", () => {
    const fog = aiDisclosureOf({ ...base, realFootage: true, footageOverlay: "fog" });
    expect(fog.altered).toBe(true);
    expect(fog.why).toContain("the Look's fog overlay is laid over uploaded clips");
    expect(fog.why).toContain('case 2: "Alters footage of a real event or place"');
    const graded = aiDisclosureOf({ ...base, realFootage: true });
    expect(graded.altered).toBe(false);
    expect(graded.why).toContain("minor edits");
    // An overlay on clips that aren't marked real footage is not case 2.
    expect(aiDisclosureOf({ ...base, footageOverlay: "embers" }).altered).toBe(false);
  });

  it("says Yes for AI pictures from an Image prompt marked photorealistic", () => {
    const answer = aiDisclosureOf({ ...base, kind: "short", photorealistic: true });
    expect(answer.altered).toBe(true);
    expect(answer.why).toContain(
      'case 3: "Generates a realistic-looking scene that didn\'t actually occur"',
    );
  });

  it("names every case that applies", () => {
    const why = aiDisclosureOf({
      ...base,
      realPersonVoices: ["Anna clone"],
      realFootage: true,
      footageOverlay: "dust",
      photorealistic: true,
    }).why;
    expect(why).toContain("case 1");
    expect(why).toContain("case 2");
    expect(why).toContain("case 3");
  });

  it("follows the channel's Always Yes or Always No over the rule", () => {
    expect(aiDisclosureOf({ ...base, setting: "yes" })).toMatchObject({ altered: true });
    expect(aiDisclosureOf({ ...base, setting: "yes" }).why).toContain("Always Yes");
    const no = aiDisclosureOf({ ...base, setting: "no", photorealistic: true });
    expect(no.altered).toBe(false);
    expect(no.why).toContain("Always No");
  });
});
