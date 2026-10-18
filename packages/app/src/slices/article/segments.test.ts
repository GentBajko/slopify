import { expect, it } from "vitest";
import { config as base } from "../rebuild/recipe-fixture.js";
import { segmentMessages } from "./segments.js";

const config = { ...base, title: "Rope Tricks", values: { topic: "rope", era: "bronze age" } };

it("asks for an entry with its prompt, the title, the run's keywords and the article", () => {
  expect(segmentMessages("Write a warm welcome.", config, "Rope is twisted fibre.")).toEqual([
    {
      role: "user",
      content: [
        "Write a warm welcome.",
        "",
        "Video title: Rope Tricks",
        "",
        "Keyword values for this run:",
        "",
        "topic: rope\nera: bronze age",
        "",
        "The article this video narrates:",
        "",
        "Rope is twisted fibre.",
      ].join("\n"),
    },
  ]);
});

it("says so rather than leaving a gap when the run has no keywords", () => {
  const content =
    segmentMessages("Write a goodbye.", { ...config, values: {} }, "Article.")[0]?.content ?? "";
  expect(content).toContain("Keyword values for this run:\n\n(none)\n");
});
