import type { RunCost, StageCost } from "@app/slices/run-cost/panel.js";
import { describe, expect, it } from "vitest";
import { imageCallsLine, imagePrice, rerunPrice } from "./stage-price.js";

function cost(row: Partial<StageCost>): RunCost {
  const stage: StageCost = {
    stage: "images",
    calls: 4,
    cost: 0.16,
    unpriced: 0,
    apiEquivalent: null,
    apiUnpriced: 0,
    tokensIn: 0,
    tokensOut: 0,
    cachedTokens: 0,
    characters: 0,
    images: 4,
    seconds: 0,
    wallMs: null,
    ...row,
  };
  return { byStage: [stage] } as unknown as RunCost;
}

describe("what making something again costs", () => {
  it("leads with the paid calls and prices them from this project's pictures, rounded up to the cent", () => {
    expect(imagePrice(cost({}), "images", 1)).toEqual({
      text: "1 paid image call, about $0.04.",
      approvedUpTo: 0.04,
    });
    expect(imagePrice(cost({ cost: 0.1, images: 3 }), "images", 2)).toEqual({
      text: "2 paid image calls, about $0.07.",
      approvedUpTo: 0.07,
    });
  });

  it("says the price isn't known when a call had no price, nothing was made yet, or the record says $0", () => {
    expect(imagePrice(cost({ unpriced: 1 }), "images", 1)).toBeUndefined();
    expect(imagePrice(cost({ images: 0 }), "images", 1)).toBeUndefined();
    expect(imagePrice(undefined, "images", 1)).toBeUndefined();
    // A sample's service records $0: that is not a price to offer.
    expect(imagePrice(cost({ cost: 0 }), "images", 1)).toBeUndefined();
    expect(imageCallsLine(undefined, 4)).toBe(
      "4 paid image calls; the image service's price isn't known in advance.",
    );
    expect(imageCallsLine(imagePrice(cost({}), "images", 1), 1)).toBe(
      "1 paid image call, about $0.04.",
    );
  });

  it("names a CLI plan's call as $0 on the plan", () => {
    expect(imagePrice(cost({ cost: 0, apiEquivalent: 0.2 }), "images", 1)).toEqual({
      text: "1 image call on your CLI plan: $0, but it uses some of the plan's limits.",
      approvedUpTo: 0,
    });
  });

  it("says a local step is free, and names a paid step's calls before any amount", () => {
    expect(rerunPrice(undefined, "video")).toBe("No charge: it runs on this computer.");
    expect(rerunPrice(cost({ stage: "audio", cost: 1.5 }), "audio")).toBe(
      "Paid voice calls; earlier runs of this step in this project cost $1.50 in all.",
    );
    expect(rerunPrice(cost({ stage: "audio", unpriced: 2 }), "audio")).toBe(
      "Paid voice calls; the price isn't known in advance.",
    );
    expect(rerunPrice(cost({ stage: "article", cost: 0 }), "article")).toBe(
      "Paid AI calls; the price isn't known in advance.",
    );
    for (const stage of ["research", "article", "audio", "images", "thumbnail"] as const)
      expect(rerunPrice(cost({ stage, cost: 0 }), stage)).not.toContain("$0");
  });
});
