import { expect, it } from "vitest";
import { newTopics, similarTopics, topicInTitle } from "./similar.js";

it("treats rewordings of one topic as the same and different subjects as different", () => {
  expect(similarTopics("Tiamat", "tiamat!")).toBe(true);
  expect(similarTopics("Tiamat", "Tiamat's Lair")).toBe(true);
  expect(similarTopics("The Mimics", "mimic")).toBe(true);
  expect(similarTopics("Café of Doom", "cafe doom")).toBe(true);
  expect(similarTopics("Red Dragons", "Blue Dragons")).toBe(false);
  expect(similarTopics("Vecna", "Strahd")).toBe(false);
});

it("finds a topic inside a project title the template wrapped it in", () => {
  expect(topicInTitle("Vecna", "D&D Lore: Vecna")).toBe(true);
  expect(topicInTitle("Strahd", "D&D Lore: Vecna")).toBe(false);
});

it("keeps new candidates in order and drops repeats among themselves", () => {
  expect(
    newTopics(["Orcus", "orcus!", "Vecna", "Lolth", "Tiamat's Lair"], {
      topics: ["Tiamat"],
      projects: ["D&D Lore: Vecna"],
    }),
  ).toEqual(["Orcus", "Lolth"]);
});
