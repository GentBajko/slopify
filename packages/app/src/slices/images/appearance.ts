import { z } from "zod";
import type { Message } from "../../kernel/ports/llm.js";
import { appearanceKeyword, detectSlots, render } from "../admission/substitute.js";

// How things look, looked up rather than guessed: when an image or thumbnail prompt has
// `{{Appearance}}`, one call to the project's AI model searches the web for how the video's
// subject and every named character in the article look in their best-known depiction. Each
// picture then gets the subject's look and the looks of the characters its scene names, so a
// figure looks the same from image to image and like the one people know.

export function usesAppearance(body: string | null | undefined): boolean {
  return body != null && detectSlots(body).names.includes(appearanceKeyword);
}

const figureSchema = z.object({
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  look: z.string(),
});
export const appearanceSchema = z.object({
  subject: figureSchema,
  characters: z.array(figureSchema).default([]),
});
export type Appearance = z.infer<typeof appearanceSchema>;
type Figure = Appearance["subject"];

export function appearanceMessages(brief: {
  readonly title: string;
  readonly article: string;
}): readonly Message[] {
  return [
    {
      role: "system",
      content: [
        "You research how things look, for the pictures of a narrated video. Search the web before you answer: official art and its descriptions, the sourcebooks and the wikis that describe them. Do not describe a figure from memory alone.",
        "Describe the video's subject: the figure, creature, place or object the video is about. Then describe every other named character who could appear in a picture: rivals, servants, gods, companions. Leave out people who only made or published the work, and anyone the article only mentions in passing.",
        "When depictions disagree (different editions, different artists), describe the most iconic one: the look most people picture, usually the best-known official art.",
        "Each look is two to four sentences of what can be seen: build and size, face, skin or hide, hair, clothing or armour, colours, and the objects or marks that make the figure recognisable. Nothing about art style or medium, and no story: the style and the scene are set elsewhere.",
        'Answer with JSON and nothing else: {"subject": {"name": "…", "aliases": ["…"], "look": "…"}, "characters": [{"name": "…", "aliases": ["…"], "look": "…"}]}. Aliases are other names or titles the article uses for the same figure.',
      ].join("\n\n"),
    },
    {
      role: "user",
      content: [
        `Video: ${brief.title}`,
        brief.article.trim() === "" ? "" : `Article:\n\n${brief.article}`,
      ]
        .filter((part) => part !== "")
        .join("\n\n"),
    },
  ];
}

export function checkAppearance(
  text: string,
):
  | { readonly ok: true; readonly appearance: Appearance }
  | { readonly ok: false; readonly reason: string } {
  const fix =
    "Use Try again; if it keeps happening, choose another model in the Providers section of Edit project.";
  const parsed = appearanceSchema.safeParse(jsonObjectOf(text));
  if (!parsed.success)
    return { ok: false, reason: `The AI model didn't answer with the looks it looked up. ${fix}` };
  const tidy = (figure: Figure): Figure => ({
    name: figure.name.trim(),
    aliases: figure.aliases.map((alias) => alias.trim()).filter((alias) => alias !== ""),
    look: figure.look.replace(/\s+/g, " ").trim(),
  });
  const subject = tidy(parsed.data.subject);
  if (subject.name === "" || subject.look === "")
    return { ok: false, reason: `The AI model described no look for the video's subject. ${fix}` };
  return {
    ok: true,
    appearance: {
      subject,
      characters: parsed.data.characters
        .map(tidy)
        .filter((figure) => figure.name !== "" && figure.look !== ""),
    },
  };
}

// The most characters besides the subject one picture describes: a crowded prompt is ignored.
const charactersPerPicture = 3;

// What `{{Appearance}}` becomes in one picture: the subject's look, then the looks of the
// characters the picture's scene names (by name or alias, as a whole word). Without a scene,
// the subject alone.
export function appearanceFor(appearance: Appearance, scene?: string): string {
  const named =
    scene === undefined
      ? []
      : appearance.characters
          .filter((figure) => [figure.name, ...figure.aliases].some((name) => names(scene, name)))
          .slice(0, charactersPerPicture);
  return [appearance.subject, ...named]
    .map((figure) => `${figure.name}: ${figure.look}`)
    .join("\n");
}

export function withAppearance(body: string, text: string): string {
  return render(body, { [appearanceKeyword]: text });
}

function names(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "iu").test(text);
}

function jsonObjectOf(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}
