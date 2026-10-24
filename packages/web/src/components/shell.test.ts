import { expect, it } from "vitest";
import { activeDestination } from "./shell";

it("lights Prompts for prompts and intros and outros, and Templates for templates and designs", () => {
  for (const path of ["/prompts", "/prompts/new", "/prompts/p1", "/entries", "/entries/e1"])
    expect(activeDestination(path)).toBe("prompts");
  for (const path of [
    "/templates",
    "/templates/0d5c1f6e-7f1a-4b5e-9a49-2f0c5d7c9a11",
    "/designs",
    "/designs/0d5c1f6e-7f1a-4b5e-9a49-2f0c5d7c9a11",
    "/design-templates/0d5c1f6e-7f1a-4b5e-9a49-2f0c5d7c9a11",
  ])
    expect(activeDestination(path)).toBe("templates");
  expect(activeDestination("/designsx")).toBeUndefined();
});

it("lights Settings for the pages reached from it", () => {
  for (const path of [
    "/settings",
    "/usage",
    "/document-themes",
    "/document-themes/t1",
    "/narration-aliases",
  ])
    expect(activeDestination(path)).toBe("settings");
});

it("lights Channels with two or more channels, and Settings, where the channel is reached, with one", () => {
  expect(activeDestination("/channels/c1", 2)).toBe("channels");
  expect(activeDestination("/ab-results", 2)).toBe("channels");
  expect(activeDestination("/channels/c1", 1)).toBe("settings");
  expect(activeDestination("/")).toBe("home");
  expect(activeDestination("/projects/p1")).toBe("projects");
  expect(activeDestination("/calendar")).toBe("calendar");
  expect(activeDestination("/help/tutorials/Home")).toBeUndefined();
});
