import { expect, it } from "vitest";
import { collectFields } from "../admission/substitute.js";
import {
  checkScenes,
  pictureKind,
  sceneCountOf,
  sceneMessages,
  usesLegacyScene,
  usesScene,
  usesSlopifyScene,
  wantsSceneDetails,
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
  expect(pictureKind("Just a prompt", "Action Scene")).toBe("Action Scene");
});

it("asks for one scene per picture, in order, and reads the count back from the request", () => {
  const messages = sceneMessages({
    title: "Lighthouse",
    article: "The article.",
    pictures: ["wide shot", "close portrait", "battle"],
  });
  expect(sceneCountOf(messages)).toBe(3);
  expect(messages[1]?.content).toContain("1. wide shot\n2. close portrait\n3. battle");
  expect(messages[1]?.content).toContain("Article:\n\nThe article.");
});

it("asks for the thumbnails' scenes after the pictures', and counts both", () => {
  const both = sceneMessages({
    title: "The lighthouse",
    article: "The article.",
    pictures: ["wide shot"],
    thumbnails: 3,
  });
  expect(sceneCountOf(both)).toBe(4);
  expect(both[0]?.content).toContain("then the 3 thumbnail scenes");
  const only = sceneMessages({
    title: "The lighthouse",
    article: "The article.",
    pictures: [],
    thumbnails: 1,
  });
  expect(sceneCountOf(only)).toBe(1);
  expect(only[1]?.content).not.toContain("pictures, in order");
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

it("knows the old and the new scene keywords apart", () => {
  expect(usesLegacyScene("{{Scene}}")).toBe(true);
  expect(usesLegacyScene("{{Slopify_Scene}}")).toBe(false);
  expect(usesSlopifyScene("{{Slopify_Mood}}")).toBe(true);
  expect(usesSlopifyScene("{{Scene}}")).toBe(false);
  expect(usesScene("{{Slopify_Scene}}")).toBe(true);
  expect(usesScene("{{Slopify_Setting}}")).toBe(false);
  expect(wantsSceneDetails("{{Slopify_Setting}}")).toBe(true);
  expect(wantsSceneDetails("{{Slopify_Scene}}")).toBe(false);
});

it("fills both scene names, and the setting and mood where the prompt asks", () => {
  expect(
    withScene(
      "Draw it.\nScene: {{Slopify_Scene}}\nWhen: {{Slopify_Setting}}\nFeel: {{Slopify_Mood}}",
      "A gate.",
      { setting: "Rome, 50 BC", mood: "tense" },
    ),
  ).toBe("Draw it.\nScene: A gate.\nWhen: Rome, 50 BC\nFeel: tense");
  expect(withScene("A {{Scene}} and {{Slopify_Scene}}", "gate")).toBe("A gate and gate");
});

it("leaves out a setting or mood line the scenes call did not write", () => {
  expect(
    withScene("Draw.\nWhen: {{Slopify_Setting}}\nFeel: {{Slopify_Mood}}", "A gate.", {
      mood: "calm",
    }),
  ).toBe("Draw.\nFeel: calm\n\nScene: A gate.");
});

it("with the Images switch off, adds no scene line and drops the old name's line", () => {
  expect(
    withScene("Draw.\n\nOld: {{Scene}}\n\nWhen: {{Slopify_Setting}}", "A gate.", {
      legacy: false,
      setting: "Rome",
    }),
  ).toBe("Draw.\n\nWhen: Rome");
});

it("drops every scene keyword's line where no scene is written", () => {
  expect(
    withoutScene("Draw.\n\n{{Slopify_Scene}}\n{{Slopify_Setting}}\n{{Slopify_Mood}}\n\nInk."),
  ).toBe("Draw.\n\nInk.");
});

it("asks for the setting and mood only when a prompt uses them", () => {
  const brief = { title: "T", article: "A.", pictures: ["wide"] };
  const plain = sceneMessages(brief);
  const detailed = sceneMessages({ ...brief, details: true });
  expect(detailed[1]).toEqual(plain[1]);
  expect(detailed[0]?.content).toContain(
    'Answer with a JSON array of exactly 1 objects, one scene per picture, each {"scene": "…", "setting": "…", "mood": "…"}, and nothing else.',
  );
  expect(detailed[0]?.content).toContain("Pictures: 1");
  expect(sceneCountOf(detailed)).toBe(1);
  const thumbs = sceneMessages({ ...brief, thumbnails: 1, details: true });
  expect(thumbs[0]?.content).toContain('each {"scene": "…", "setting": "…", "mood": "…"}');
});

it("takes scenes with their setting and mood, alone or mixed with plain ones", () => {
  expect(
    checkScenes('[{"scene": " A  gate.", "setting": "Rome", "mood": "calm"}, "A hill."]', 2),
  ).toEqual({
    ok: true,
    scenes: ["A gate.", "A hill."],
    details: [{ setting: "Rome", mood: "calm" }, {}],
  });
  expect(checkScenes('[{"setting": "Rome"}]', 1).ok).toBe(false);
});
