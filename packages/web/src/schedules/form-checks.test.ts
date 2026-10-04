import { describe, expect, it } from "vitest";
import {
  centsToDollars,
  dollarsToCents,
  firstProblem,
  problemSummary,
  scheduleProblems,
} from "./form-checks";

const fine = {
  name: "Morning",
  templateChosen: true,
  kind: "weekly" as const,
  onceAt: "",
  time: "09:00",
  days: [1],
  timezone: "Europe/Tirane",
  spend: "",
  topicProblems: [],
  topicCount: 3,
  brief: "",
  generationLlm: null,
};

describe("schedule form checks", () => {
  it("passes a complete form", () => {
    expect(scheduleProblems(fine)).toEqual({});
  });

  it("marks each field in screen order", () => {
    const problems = scheduleProblems({ ...fine, name: " ", days: [], timezone: "Mars/Olympus" });
    expect(Object.keys(problems)).toEqual(["name", "weekdays", "timezone"]);
    expect(firstProblem(problems)).toBe("name");
    expect(problemSummary(problems)).toMatch(/^Name: Give the schedule a name\. Weekdays: /);
  });

  it("reads the spend ceiling in dollars", () => {
    expect(dollarsToCents("")).toBeNull();
    expect(dollarsToCents("5")).toBe(500);
    expect(dollarsToCents("$2.5")).toBe(250);
    expect(dollarsToCents("0.07")).toBe(7);
    expect(dollarsToCents("2.555")).toBeUndefined();
    expect(dollarsToCents("five")).toBeUndefined();
    expect(centsToDollars(500)).toBe("5");
    expect(centsToDollars(250)).toBe("2.50");
    expect(centsToDollars(null)).toBe("");
    expect(scheduleProblems({ ...fine, spend: "1,000" }).spend).toContain("US dollars");
  });
});
