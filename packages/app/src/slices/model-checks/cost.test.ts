import { describe, expect, it } from "vitest";
import { catalogue } from "./catalogue.fake.js";
import { automaticAllowed, costOf, spentOn } from "./cost.js";

const llm = (model: string) => ({ provider: "openrouter", family: "llm", model }) as const;

describe("check costs", () => {
  it("prices a short question, two characters and one image at list price", () => {
    expect(costOf(catalogue, llm("cheap")).dollars).toBeCloseTo((40 * 1 + 40 * 4) / 1e6);
    expect(
      costOf(catalogue, { provider: "elevenlabs", family: "tts", model: "v1" }).dollars,
    ).toBeCloseTo(6e-5);
    expect(
      costOf(catalogue, { provider: "cartesia", family: "tts", model: "sonic" }).dollars,
    ).toBeCloseTo(0.0005);
    expect(costOf(catalogue, { provider: "fal", family: "image", model: "flux" }).dollars).toBe(
      0.0005,
    );
    expect(costOf(catalogue, llm("unpriced")).dollars).toBeNull();
  });

  it("counts a CLI as plan usage and the system voice as free", () => {
    expect(costOf(catalogue, { provider: "codex", family: "llm", model: "gpt-5" })).toEqual({
      dollars: 0,
      planUsage: true,
    });
    expect(costOf(catalogue, { provider: "system-voice", family: "tts", model: "say" })).toEqual({
      dollars: 0,
      planUsage: false,
    });
  });

  it("allows automatically only free, plan, or text and voice under a tenth of a cent", () => {
    const allowed = (target: Parameters<typeof costOf>[1]) =>
      automaticAllowed(catalogue, target, costOf(catalogue, target));
    expect(allowed(llm("cheap"))).toBe(true);
    expect(allowed(llm("dear"))).toBe(false);
    expect(allowed(llm("unpriced"))).toBe(false);
    expect(allowed({ provider: "codex", family: "llm", model: "gpt-5" })).toBe(true);
    expect(allowed({ provider: "elevenlabs", family: "tts", model: "v1" })).toBe(true);
    expect(allowed({ provider: "fal", family: "image", model: "flux" })).toBe(false);
    expect(allowed({ provider: "fal", family: "image", model: "clip" })).toBe(false);
    expect(allowed({ provider: "codex-image", family: "image", model: "gpt-5" })).toBe(false);
  });

  it("records what the check reported, else the estimate", () => {
    const target = llm("cheap");
    const use = {
      kind: "llm",
      provider: "openrouter",
      model: "cheap",
      tokensIn: 10,
      tokensOut: 1,
      wallMs: 1,
    } as const;
    expect(spentOn(catalogue, target, use)).toBeCloseTo((10 + 4) / 1e6);
    expect(spentOn(catalogue, target, null)).toBeCloseTo(costOf(catalogue, target).dollars ?? -1);
    expect(spentOn(catalogue, llm("unpriced"), null)).toBe(0);
    expect(spentOn(catalogue, { provider: "codex", family: "llm", model: "x" }, use)).toBe(0);
  });
});
