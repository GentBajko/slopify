import { expect, it } from "vitest";
import { activeDestination } from "./shell";

it("lights the Library rail item on every Library page, Designs included", () => {
  for (const path of [
    "/prompts",
    "/templates",
    "/library/voices",
    "/designs",
    "/designs/0d5c1f6e-7f1a-4b5e-9a49-2f0c5d7c9a11",
    "/design-templates/0d5c1f6e-7f1a-4b5e-9a49-2f0c5d7c9a11",
  ])
    expect(activeDestination(path)).toBe("library");
  expect(activeDestination("/")).toBe("home");
  expect(activeDestination("/settings/usage")).toBe("settings");
  expect(activeDestination("/designsx")).toBeUndefined();
});
