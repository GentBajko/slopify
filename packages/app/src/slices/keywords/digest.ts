import { z } from "zod";
import type { Message } from "../../kernel/ports/llm.js";
import { keywordSpecs } from "./specs.js";

// The keyword digest: one call to the project's AI model reads the article once and writes every
// digest keyword (`{{Slopify_Summary}}`, `{{Slopify_Hook}}`…), so a run that uses several pays for
// one call. It asks for all six every time, so adding one more digest keyword to a prompt later
// reuses the same answer.

export const digestNames: readonly string[] = keywordSpecs
  .filter((spec) => spec.filler === "digest")
  .map((spec) => spec.name);

export function digestMessages(brief: {
  readonly title: string;
  readonly article: string;
}): readonly Message[] {
  return [
    {
      role: "system",
      content: [
        "You write short texts about a narrated video from its article, for its pictures, thumbnail, description, shorts and reviews.",
        "summary: two or three sentences on what the video covers.",
        "hook: the single most click-worthy idea of the video, in one sentence.",
        "thumbnailText: two to four words to put on the thumbnail, in the video's language.",
        "keyFacts: three to five striking facts the article states, each one sentence.",
        "quote: one quotable line from the article, as it is written there.",
        "tags: five to fifteen search terms someone would type to find this video.",
        "Use only what the article says. Write in the article's language.",
        'Answer with JSON and nothing else: {"summary": "…", "hook": "…", "thumbnailText": "…", "keyFacts": ["…"], "quote": "…", "tags": ["…"]}.',
      ].join("\n\n"),
    },
    {
      role: "user",
      content: [`Video: ${brief.title}`, `Article:\n\n${brief.article}`].join("\n\n"),
    },
  ];
}

const listOrText = z.union([z.array(z.string()), z.string()]);
const digestSchema = z.object({
  summary: z.string(),
  hook: z.string(),
  thumbnailText: z.string(),
  keyFacts: listOrText,
  quote: z.string(),
  tags: listOrText,
});

// The digest as each keyword's text, by keyword name.
export type Digest = Readonly<Record<string, string>>;

export function checkDigest(
  text: string,
):
  | { readonly ok: true; readonly digest: Digest }
  | { readonly ok: false; readonly reason: string } {
  const fix =
    "Use Try again; if it keeps happening, choose another model in the Providers section of Edit project.";
  const parsed = digestSchema.safeParse(jsonObjectOf(text));
  if (!parsed.success)
    return {
      ok: false,
      reason: `The AI model didn't answer with the keyword digest (summary, hook, thumbnail text, key facts, quote and tags). ${fix}`,
    };
  const tidy = (value: string): string => value.replace(/\s+/g, " ").trim();
  const list = (value: string | readonly string[]): readonly string[] =>
    (typeof value === "string" ? value.split("\n") : value)
      .map((one) => tidy(one).replace(/^[-•*]\s*/, ""))
      .filter((one) => one !== "");
  const { summary, hook, thumbnailText, keyFacts, quote, tags } = parsed.data;
  const digest: Record<string, string> = {
    Slopify_Summary: tidy(summary),
    Slopify_Hook: tidy(hook),
    Slopify_Thumbnail_Text: tidy(thumbnailText),
    Slopify_Key_Facts: list(keyFacts).join("\n"),
    Slopify_Quote: tidy(quote),
    Slopify_Tags: (typeof tags === "string" ? tags.split(",") : tags)
      .map(tidy)
      .filter((one) => one !== "")
      .join(", "),
  };
  const empty = digestNames.filter((name) => (digest[name] ?? "") === "");
  if (empty.length > 0)
    return {
      ok: false,
      reason: `The AI model left part of the keyword digest empty (${empty.map((name) => `{{${name}}}`).join(", ")}). ${fix}`,
    };
  return { ok: true, digest };
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
