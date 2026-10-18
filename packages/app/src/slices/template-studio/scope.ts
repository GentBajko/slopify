import { detectSlots } from "../admission/substitute.js";
import type { PlayDraftDocument } from "../play-drafts/schema.js";

// What a template's paid sample makes: a short taste of one video about the sample topic, so a
// Save costs cents, not a whole video. The limits are the document's (fewer pictures, one
// thumbnail, one short, no checkpoints) and the steps' (`config.sample`: the article's outline
// and first chapter, the narration's opening).

// The most pictures a sample draws.
export const samplePictures = 4;
// The narration a sample says: about 30 seconds, the length of the video sample.
export const sampleSpokenWords = 80;

// Put under the article prompt of a sample, unless the person asked for the full script. The
// prompt anatomy shows it as Slopify's.
export const sampleArticleInstruction =
  "This is a short sample of the script: write the outline and only chapter 1, then stop.";

export interface SampleScope {
  readonly topic: string;
  readonly fullScript: boolean;
}

// The template's setup as its sample runs it. Every keyword the title names and the template
// leaves empty is the topic; a title without one is the topic itself. A section the user
// provides at run time has no sample, so it is off here, with no file to attach.
export function sampleDocument(template: PlayDraftDocument, scope: SampleScope): PlayDraftDocument {
  const { form } = template;
  const topic = scope.topic.trim();
  const names = detectSlots(form.title).names;
  const values: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [name, value] of Object.entries(form.values)) values[name] = value;
  for (const name of names) if ((values[name] ?? "").trim() === "") values[name] = topic;
  const off = <T extends string>(source: T): T | "off" => (source === "provide" ? "off" : source);
  const sources = {
    research: off(form.sources.research),
    article: off(form.sources.article),
    audio: off(form.sources.audio),
    images: off(form.sources.images),
    thumbnail: off(form.sources.thumbnail),
    video: off(form.sources.video),
    ...(form.sources.document === undefined ? {} : { document: off(form.sources.document) }),
  };
  const reviews =
    form.reviews === undefined
      ? undefined
      : form.reviews.reviewer === "agent"
        ? // An agent's reviews are answered outside Slopify: the sample never asks it.
          { ...form.reviews, stages: {} }
        : form.reviews;
  const { imageScale: _scaled, ...unscaled } = form;
  return {
    ...template,
    variants: [],
    form: {
      ...unscaled,
      title: names.length === 0 ? topic : form.title,
      values,
      sources,
      checkpoints: [],
      thumbnailCount: 1,
      imagePrompts: cappedPrompts(form.imagePrompts, samplePictures),
      ...(form.shorts === undefined
        ? {}
        : { shorts: { ...form.shorts, count: form.shorts.enabled ? "1" : form.shorts.count } }),
      ...(reviews === undefined ? {} : { reviews }),
      ...(form.reference === undefined || form.reference.source !== "provide"
        ? {}
        : { reference: { ...form.reference, source: "off" as const } }),
      ...(form.ambientBed === undefined || form.ambientBed.source !== "upload"
        ? {}
        : { ambientBed: { ...form.ambientBed, source: "none" as const } }),
      provided: {
        research: "",
        article: "",
        audio: null,
        thumbnail: null,
        images: [],
        ...(form.provided.reference === undefined ? {} : { reference: null }),
        ...(form.provided.shortsMusic === undefined ? {} : { shortsMusic: null }),
        ...(form.provided.ambientBed === undefined ? {} : { ambientBed: null }),
      },
    },
  };
}

// The image prompts with at most `most` pictures between them, in order: each keeps its own
// number while they fit, and a prompt past the limit draws none.
function cappedPrompts(
  prompts: PlayDraftDocument["form"]["imagePrompts"],
  most: number,
): PlayDraftDocument["form"]["imagePrompts"] {
  let left = most;
  return prompts.flatMap((prompt) => {
    const wanted = Number.parseInt(prompt.number, 10);
    const count = Math.min(Number.isFinite(wanted) && wanted > 0 ? wanted : 1, left);
    left -= count;
    return count > 0 ? [{ ...prompt, number: String(count) }] : [];
  });
}

// The opening of the narration a sample says: whole sentences up to about `words` words, at
// least the first sentence.
export function sampleNarrationText(text: string, words = sampleSpokenWords): string {
  const sentences = text.match(/[^.!?\n]+(?:[.!?]+["')\]]*|\n+|$)/gu) ?? [text];
  let kept = "";
  let count = 0;
  for (const sentence of sentences) {
    const size = sentence.split(/\s+/u).filter((word) => word !== "").length;
    if (kept !== "" && count + size > words) break;
    kept += sentence;
    count += size;
  }
  return kept.trim();
}
