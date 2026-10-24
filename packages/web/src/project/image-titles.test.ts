import { expect, it } from "vitest";
import { imageTitles } from "./image-titles.js";

const template = (scene: string) =>
  `Create an official Dungeons & Dragons illustration in the style of the core rulebooks.\n\nScene: ${scene}\n\nComposition: a wide view. No text or lettering.`;

it("names each image by what its prompt says that the others' don't: its scene", () => {
  expect(
    imageTitles([
      template("A drow priestess stands before a purple rift."),
      template("Floating islands hang over a green cavern sea."),
    ]),
  ).toEqual([
    "A drow priestess stands before a purple rift.",
    "Floating islands hang over a green cavern sea.",
  ]);
});

it("takes the scene from a one-line prompt, up to the next label", () => {
  const inline = (scene: string, composition: string) =>
    `Create an official illustration about "The Underdark". Scene: ${scene} Composition: ${composition}. Style: an early modern print.`;
  expect(
    imageTitles([
      inline("Explorers scramble along a rock shelf above a fossil sea.", "dynamic action"),
      inline("A drow priestess stands before a purple rift.", "close portrait"),
    ]),
  ).toEqual([
    "Explorers scramble along a rock shelf above a fossil sea.",
    "A drow priestess stands before a purple rift.",
  ]);
});

it("keeps a scene whole when two scenes start or end alike", () => {
  expect(
    imageTitles([template("A city of spires under red light."), template("A city of bridges.")]),
  ).toEqual(["A city of spires under red light.", "A city of bridges."]);
});

it("falls back to the whole prompt when there is no scene and nothing differs", () => {
  expect(imageTitles([template("A lone figure.")])).toEqual(["A lone figure."]);
  expect(imageTitles(["Same prompt", "Same prompt"])).toEqual(["Same prompt", "Same prompt"]);
  expect(imageTitles([undefined, "A prompt"])).toEqual([undefined, "A prompt"]);
});

it("names one-line prompts with a shared opening and close by the words between", () => {
  const frame = (scene: string, close = "No text.") =>
    `Painterly documentary illustration, oil on canvas, soft cinematic light: ${scene} ${close}`;
  expect(
    imageTitles([
      frame("a ruined colonnade against an orange sky."),
      frame("the harbor of ancient Alexandria at dusk. Warm sky, deep blue sea,", "no text."),
    ]),
  ).toEqual([
    "A ruined colonnade against an orange sky.",
    "The harbor of ancient Alexandria at dusk. Warm sky, deep blue sea",
  ]);
  // Prompts that share only a word or two are each their own name.
  expect(imageTitles(["A red door.", "A blue window."])).toEqual(["A red door.", "A blue window."]);
});
