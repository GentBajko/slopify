import { expect, it } from "vitest";
import { collectFields } from "../admission/substitute.js";
import {
  checkScenes,
  pictureKind,
  sceneCountOf,
  sceneMessages,
  usesScene,
  withoutScene,
  withScene,
} from "./scenes.js";

it("knows a prompt that asks for a scene, and never asks the person to fill it", () => {
  expect(usesScene('An illustration about "{{Topic}}". Scene: {{Scene}}')).toBe(true);
  expect(usesScene('An illustration about "{{Topic}}".')).toBe(false);
  expect(usesScene(null)).toBe(false);
  expect(collectFields([], ["{{Topic}} {{Scene}}"]).map((field) => field.name)).toEqual(["Topic"]);
});

it("describes each picture by its composition, or its name when it has none", () => {
  expect(pictureKind("Style: x\n\nComposition: wide establishing shot.\n\nMore.", "Wide")).toBe(
    "wide establishing shot.",
  );
  expect(pictureKind("Just a prompt", "D&D Action Scene")).toBe("D&D Action Scene");
});

it("asks for one scene per picture, in order, and reads the count back from the request", () => {
  const messages = sceneMessages({
    title: "Tiamat",
    article: "The article.",
    pictures: ["wide shot", "close portrait", "battle"],
  });
  expect(sceneCountOf(messages)).toBe(3);
  expect(messages[1]?.content).toContain("1. wide shot\n2. close portrait\n3. battle");
  expect(messages[1]?.content).toContain("Article:\n\nThe article.");
});

it("takes exactly the scenes asked for and says what was wrong otherwise", () => {
  expect(checkScenes('Here: ["A  gate at dawn.", "Two gods fighting."]', 2)).toEqual({
    ok: true,
    scenes: ["A gate at dawn.", "Two gods fighting."],
  });
  const short = checkScenes('["Only one."]', 2);
  expect(short.ok).toBe(false);
  if (!short.ok) expect(short.reason).toContain("wrote 1 image scenes for 2 images");
  expect(checkScenes("No list here.", 2).ok).toBe(false);
  expect(checkScenes('["A gate.", " "]', 2).ok).toBe(false);
});

it("puts the scene where the prompt asks, or after its first paragraph, and drops it when off", () => {
  expect(withScene("Draw it.\n\nScene: {{Scene}}\n\nStyle: ink.", "A gate.")).toBe(
    "Draw it.\n\nScene: A gate.\n\nStyle: ink.",
  );
  expect(withScene("Draw it.\n\nStyle: ink.", "A gate.")).toBe(
    "Draw it.\n\nScene: A gate.\n\nStyle: ink.",
  );
  expect(withScene("Draw it.", "A gate.")).toBe("Draw it.\n\nScene: A gate.");
  expect(withoutScene("Draw it.\n\nScene: {{Scene}}\n\nStyle: ink.")).toBe(
    "Draw it.\n\nStyle: ink.",
  );
  expect(withoutScene("Draw it.\n\nStyle: ink.")).toBe("Draw it.\n\nStyle: ink.");
});
