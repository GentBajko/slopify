import { z } from "zod";
import type { Message } from "../../kernel/ports/llm.js";
import { detectSlots, render, sceneKeyword } from "../admission/substitute.js";

// Scenes from the article (Images → Scenes from the article): each image is drawn from its
// own scene instead of the same text every time. One call to the project's AI model reads the
// article and writes every scene, following the article from its opening to its end in the
// order the images are shown.

export function usesScene(body: string | null | undefined): boolean {
  return body != null && detectSlots(body).names.includes(sceneKeyword);
}

// The prompt with its scene: where the prompt has `{{Scene}}`, there; otherwise as a line of
// its own after the prompt's first paragraph, so any prompt takes a scene without editing.
export function withScene(body: string, scene: string): string {
  if (usesScene(body)) return render(body, { [sceneKeyword]: scene });
  const at = body.indexOf("\n\n");
  return at === -1
    ? `${body}\n\nScene: ${scene}`
    : `${body.slice(0, at)}\n\nScene: ${scene}${body.slice(at)}`;
}

// The prompt with the switch off: a line that holds `{{Scene}}` is left out, so the image is
// drawn from the rest of the prompt as it always was.
export function withoutScene(body: string): string {
  if (!usesScene(body)) return body;
  return body
    .split("\n")
    .filter((line) => !usesScene(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// What kind of picture each image is: the prompt's own "Composition:" paragraph when it has
// one (the wide shot, the close portrait), otherwise the prompt's name.
export function pictureKind(body: string, name: string): string {
  const composition = /^\s*Composition:\s*(.+)$/im.exec(body)?.[1]?.trim();
  return composition === undefined || composition === "" ? name : composition;
}

// The count is written on a line of its own so the answer can be checked against it when the
// call runs (`sceneCountOf`), from the saved request alone.
const countLine = /^Pictures: (\d+)$/m;

// The thumbnails' scenes come after the images', one per thumbnail, when the thumbnail
// prompt asks for one with `{{Scene}}`. They are not tied to a stretch of the article: each is
// the moment that would make someone click, a different one for each thumbnail.
const thumbnailLine = /^Thumbnails: (\d+)$/m;

export function sceneMessages(brief: {
  readonly title: string;
  readonly article: string;
  readonly pictures: readonly string[];
  readonly thumbnails?: number;
}): readonly Message[] {
  const count = brief.pictures.length;
  const thumbnails = brief.thumbnails ?? 0;
  if (thumbnails > 0) return withThumbnails(brief, count, thumbnails);
  return [
    {
      role: "system",
      content: [
        "You plan the pictures for a narrated video. Read the article and write one scene for each picture listed, in the listed order.",
        `The pictures are shown in that order while the article is narrated from start to finish. Divide the article into ${String(count)} consecutive stretches of about equal length: scene 1 comes from the first stretch, scene 2 from the second, and so on, so the last scene comes from the ending. Keep to this order even when a later moment would suit a picture better.`,
        "Each scene is one or two sentences saying what the picture shows: the subject, the place, what is happening, and the light and mood. Choose a moment its stretch of the article actually describes, and frame it the way the picture's kind asks (a wide view, a close figure, a moment of action, a mood).",
        "Every scene shows something different: never the same subject or moment twice.",
        "Describe only what can be seen. No text, lettering, captions, labels or logos in the picture, and nothing about art style or medium: the style is set elsewhere.",
        `Answer with a JSON array of exactly ${String(count)} strings, one scene per picture, and nothing else.`,
        `Pictures: ${String(count)}`,
      ].join("\n\n"),
    },
    {
      role: "user",
      content: [
        `Video: ${brief.title}`,
        `The ${String(count)} pictures, in order:\n${brief.pictures.map((kind, index) => `${String(index + 1)}. ${kind}`).join("\n")}`,
        `Article:\n\n${brief.article}`,
      ].join("\n\n"),
    },
  ];
}

// How many scenes the answer must hold: the images' and then the thumbnails'.
export function sceneCountOf(messages: readonly Message[]): number | undefined {
  for (const message of messages) {
    const found = countLine.exec(message.content);
    if (found?.[1] !== undefined)
      return Number(found[1]) + Number(thumbnailLine.exec(message.content)?.[1] ?? 0);
  }
  return undefined;
}

function withThumbnails(
  brief: { readonly title: string; readonly article: string; readonly pictures: readonly string[] },
  count: number,
  thumbnails: number,
): readonly Message[] {
  const total = count + thumbnails;
  const several = thumbnails > 1;
  return [
    {
      role: "system",
      content: [
        count === 0
          ? `You plan the thumbnail${several ? "s" : ""} for a narrated video. Read the article and write ${several ? `${String(thumbnails)} thumbnail scenes` : "one thumbnail scene"}.`
          : "You plan the pictures for a narrated video. Read the article and write one scene for each picture listed, in the listed order, and then the thumbnail scenes.",
        ...(count === 0
          ? []
          : [
              `The pictures are shown in that order while the article is narrated from start to finish. Divide the article into ${String(count)} consecutive stretches of about equal length: scene 1 comes from the first stretch, scene 2 from the second, and so on, so the last picture's scene comes from the ending. Keep to this order even when a later moment would suit a picture better.`,
              "Each picture's scene is one or two sentences saying what the picture shows: the subject, the place, what is happening, and the light and mood. Choose a moment its stretch of the article actually describes, and frame it the way the picture's kind asks (a wide view, a close figure, a moment of action, a mood).",
              "Every picture's scene shows something different: never the same subject or moment twice.",
            ]),
        `A thumbnail scene is one or two sentences saying what the thumbnail shows: the video's most recognisable subject in the most striking moment the article describes, the one that would make someone click. It comes from anywhere in the article, not from a stretch.${several ? " Each thumbnail scene shows a different moment or side of the subject, so the thumbnails can be tested against each other." : ""}`,
        "Describe only what can be seen. No text, lettering, captions, labels or logos in the picture, and nothing about art style or medium: the style is set elsewhere.",
        count === 0
          ? `Answer with a JSON array of exactly ${String(total)} strings, one per thumbnail, and nothing else.`
          : `Answer with a JSON array of exactly ${String(total)} strings, one scene per picture in order and then ${several ? `the ${String(thumbnails)} thumbnail scenes` : "the thumbnail scene"}, and nothing else.`,
        `Pictures: ${String(count)}`,
        `Thumbnails: ${String(thumbnails)}`,
      ].join("\n\n"),
    },
    {
      role: "user",
      content: [
        `Video: ${brief.title}`,
        ...(count === 0
          ? []
          : [
              `The ${String(count)} pictures, in order:\n${brief.pictures.map((kind, index) => `${String(index + 1)}. ${kind}`).join("\n")}`,
            ]),
        `Thumbnails: ${String(thumbnails)}`,
        `Article:\n\n${brief.article}`,
      ].join("\n\n"),
    },
  ];
}

export function checkScenes(
  text: string,
  count: number,
):
  | { readonly ok: true; readonly scenes: readonly string[] }
  | { readonly ok: false; readonly reason: string } {
  const fix =
    "Use Try again; if it keeps happening, choose another model in the Providers section of Edit project.";
  const parsed = z.array(z.string()).safeParse(jsonArrayOf(text));
  if (!parsed.success)
    return {
      ok: false,
      reason: `The AI model didn't answer with a list of image scenes. ${fix}`,
    };
  const scenes = parsed.data.map((scene) => scene.replace(/\s+/g, " ").trim());
  if (scenes.length !== count)
    return {
      ok: false,
      reason: `The AI model wrote ${String(scenes.length)} image scenes for ${String(count)} images. ${fix}`,
    };
  if (scenes.some((scene) => scene === ""))
    return { ok: false, reason: `One of the AI model's image scenes is empty. ${fix}` };
  return { ok: true, scenes };
}

function jsonArrayOf(text: string): unknown {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}
