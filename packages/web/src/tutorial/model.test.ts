import { describe, expect, it } from "vitest";
import { playSections } from "@/play/sections";
import { settingsSections } from "@/routes/settings";
import { playTargetSection, tutorialSteps } from "./model";

// The tutorial points at screens by route, section and `data-tour` name. When a screen is
// redesigned these are what break silently, so each is pinned to the screen's own list.
describe("tutorial steps point at screens that exist", () => {
  it("opens Settings sections that Settings still has", () => {
    const sections = new Set<string>(settingsSections.map((section) => section.id));
    // runner.tsx opens "voices" for the voice step and "providers" for the key steps.
    for (const step of tutorialSteps.filter((one) => one.page === "settings"))
      expect(sections.has(step.id === "voice" ? "voices" : "providers")).toBe(true);
  });

  it("opens Play sections that Play still has, for every Play step", () => {
    const sections = new Set<string>(playSections.map((section) => section.id));
    for (const step of tutorialSteps.filter((one) => one.page === "play")) {
      const section = playTargetSection[step.id as keyof typeof playTargetSection];
      expect(section, step.id).toBeDefined();
      expect(sections.has(section)).toBe(true);
    }
  });
});
