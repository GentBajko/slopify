import type { RunCost, StageCost } from "@app/slices/run-cost/panel.js";
import { describe, expect, it } from "vitest";
import { imagePrice, rerunPrice } from "./stage-price.js";

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
  it("prices a picture from what this project's pictures cost, rounded up to the cent", () => {
    expect(imagePrice(cost({}), "images", 1)).toEqual({
      text: "About $0.04, from what this project's pictures have cost so far.",
      approvedUpTo: 0.04,
    });
    expect(imagePrice(cost({ cost: 0.1, images: 3 }), "images", 2)?.approvedUpTo).toBe(0.07);
  });

  it("says nothing when a call had no price or nothing was made yet", () => {
    expect(imagePrice(cost({ unpriced: 1 }), "images", 1)).toBeUndefined();
    expect(imagePrice(cost({ images: 0 }), "images", 1)).toBeUndefined();
    expect(imagePrice(undefined, "images", 1)).toBeUndefined();
  });

  it("names a CLI plan's call as $0 on the plan", () => {
    expect(imagePrice(cost({ cost: 0, apiEquivalent: 0.2 }), "images", 1)?.approvedUpTo).toBe(0);
  });

  it("says a local step is free and an earlier run's total otherwise", () => {
    expect(rerunPrice(undefined, "video")).toBe("No charge: it runs on this computer.");
    expect(rerunPrice(cost({ stage: "audio", cost: 1.5 }), "audio")).toBe(
      "Earlier runs of this step in this project cost $1.50 in all.",
    );
    expect(rerunPrice(cost({ stage: "audio", unpriced: 2 }), "audio")).toBeUndefined();
  });
});
