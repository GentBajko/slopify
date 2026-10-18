import { expect, it } from "vitest";
import { exportableSettings } from "./portable.js";

it("carries the template studio's daily budget and plan switch in a backup, checked", () => {
  expect(
    exportableSettings({
      "templateStudio.dailyBudget": "0.5",
      "templateStudio.samplesUsePlans": "true",
    }),
  ).toEqual({ "templateStudio.dailyBudget": "0.5", "templateStudio.samplesUsePlans": "true" });
  expect(
    exportableSettings({
      "templateStudio.dailyBudget": "-3",
      "templateStudio.samplesUsePlans": '"yes"',
    }),
  ).toEqual({});
});
