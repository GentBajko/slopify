import { expect, it } from "vitest";
import { newTopics, similarTopics, topicInTitle } from "./similar.js";

it("treats rewordings of one topic as the same and different subjects as different", () => {
  expect(similarTopics("Cleopatra", "cleopatra!")).toBe(true);
  expect(similarTopics("Cleopatra", "Cleopatra's Palace")).toBe(true);
  expect(similarTopics("The Obelisks", "obelisk")).toBe(true);
  expect(similarTopics("Café of Doom", "cafe doom")).toBe(true);
  expect(similarTopics("Red Pyramids", "Bent Pyramids")).toBe(false);
  expect(similarTopics("Hypatia", "Ramesses")).toBe(false);
});

it("finds a topic inside a project title the template wrapped it in", () => {
  expect(topicInTitle("Hypatia", "History: Hypatia")).toBe(true);
  expect(topicInTitle("Ramesses", "History: Hypatia")).toBe(false);
  expect(
    topicInTitle("Library of Alexandria", "Sleep Stories | The Library of Alexandria (Part 2)"),
  ).toBe(true);
  expect(topicInTitle("Ramesses the Great", "Who was Ramesses the Great really?")).toBe(true);
});

it("needs a near-exact title part for a topic of one or two words", () => {
  expect(topicInTitle("Pyramids", "The Great Pyramids of Giza")).toBe(false);
  expect(topicInTitle("Red Pyramids", "Why Red Pyramids Hold Gold, and Bent Ones Don't")).toBe(
    false,
  );
  expect(topicInTitle("Red Pyramids", "History - Red Pyramids")).toBe(true);
  expect(topicInTitle("Obelisks", "The Obelisk")).toBe(true);
});

it("keeps new candidates in order and drops repeats among themselves", () => {
  expect(
    newTopics(["Imhotep", "imhotep!", "Hypatia", "Nefertiti", "Cleopatra's Palace"], {
      topics: ["Cleopatra"],
      projects: ["History: Hypatia"],
    }),
  ).toEqual(["Imhotep", "Nefertiti"]);
});
