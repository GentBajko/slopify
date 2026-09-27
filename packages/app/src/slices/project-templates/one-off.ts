import { detectSlots } from "../admission/substitute.js";
import type { PlayDraftDocument } from "../play-drafts/model.js";

// A template keeps the settings, never what was typed for one video. A keyword the project
// title names ({{Topic}} in "History: {{Topic}}") is the video's topic: it changes with every
// video, so a template stores it empty. Every other keyword ({{minWords}}, {{style}}) is a
// setting and keeps its value.
export function topicKeywords(title: string): readonly string[] {
  return detectSlots(title).names;
}

// The values a template stores: the topic keywords emptied, the rest as they were.
export function templateValues(
  title: string,
  values: Readonly<Record<string, string>>,
): Record<string, string> {
  const topics = topicKeywords(title);
  // Prototype-free, as `slices/admission/rules.ts` explains: a keyword can be "__proto__".
  const kept: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [name, value] of Object.entries(values))
    kept[name] = topics.includes(name) ? "" : value;
  return kept;
}

// The Play document a template is saved from, without the one-off values: the topic keywords
// emptied and the queued extra videos dropped (each is a topic of its own).
export function templateDocument(document: PlayDraftDocument): PlayDraftDocument {
  return {
    ...document,
    form: { ...document.form, values: templateValues(document.form.title, document.form.values) },
    variants: [],
  };
}
