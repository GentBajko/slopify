import { detectSlots, filledKeywords, render, type SlotLintKind } from "../admission/substitute.js";
import { isReserved, reservedPrefix } from "../keywords/model.js";
import type { DesignDocument } from "./schema.js";

// A design's fields are the {{names}} in its picture prompt, its text blocks and its brochure,
// in the order they first appear. The person fills every one; nothing is filled by Slopify.

export type FieldProblem =
  | { readonly kind: "reserved"; readonly name: string; readonly sentence: string }
  | {
      readonly kind: "slot";
      readonly where: string;
      readonly error: SlotLintKind;
      readonly sentence: string;
    }
  | { readonly kind: "date-field"; readonly name: string; readonly sentence: string };

interface Body {
  readonly where: string;
  readonly text: string;
}

function bodies(doc: DesignDocument): readonly Body[] {
  return [
    { where: "the picture prompt", text: doc.picture.prompt },
    ...doc.text.blocks.map((block, index) => ({
      where: `text block ${String(index + 1)}`,
      text: block.text,
    })),
    ...(doc.brochure === undefined
      ? []
      : [
          { where: "the brochure title", text: doc.brochure.title },
          { where: "the brochure text", text: doc.brochure.body },
        ]),
  ];
}

export function designFields(doc: DesignDocument): readonly string[] {
  const names: string[] = [];
  for (const body of bodies(doc))
    for (const name of detectSlots(body.text).names) if (!names.includes(name)) names.push(name);
  return names;
}

const slotSentences: Readonly<Record<SlotLintKind, string>> = {
  unclosed: "has a {{ without its }}",
  empty: "has an empty {{}}",
  nested: "has a { or } inside a {{keyword}}",
};

export function fieldProblems(doc: DesignDocument): readonly FieldProblem[] {
  const problems: FieldProblem[] = [];
  for (const body of bodies(doc))
    for (const error of detectSlots(body.text).errors)
      problems.push({
        kind: "slot",
        where: body.where,
        error: error.kind,
        sentence: `The ${body.where.replace(/^the /, "")} ${slotSentences[error.kind]}. Fix it so every keyword reads {{Name}}.`,
      });
  const names = designFields(doc);
  for (const name of names)
    if (isReserved(name) || filledKeywords.includes(name))
      problems.push({
        kind: "reserved",
        name,
        sentence: `{{${name}}} is a name Slopify keeps for videos, so a design can't use it. Rename it (for example {{${isReserved(name) ? name.slice(reservedPrefix.length) : name}Text}}).`,
      });
  const dateField = doc.schedule?.dateField;
  if (dateField !== undefined && !names.includes(dateField))
    problems.push({
      kind: "date-field",
      name: dateField,
      sentence: `The schedule reads each row's date from {{${dateField}}}, but no text uses it. Put {{${dateField}}} in a text block, or choose another date keyword under Schedule.`,
    });
  return problems;
}

// A field counts as filled only with something other than spaces.
export function missingValues(
  doc: DesignDocument,
  values: Readonly<Record<string, string>>,
): readonly string[] {
  return designFields(doc).filter(
    (name) => (Object.hasOwn(values, name) ? (values[name] ?? "") : "").trim() === "",
  );
}

export function missingSentence(missing: readonly string[]): string {
  const list = missing.map((name) => `{{${name}}}`);
  const named =
    list.length === 1
      ? `${list[0] ?? ""} has`
      : `${list.slice(0, -1).join(", ")} and ${list.at(-1) ?? ""} have`;
  return `${named} no value. Fill ${list.length === 1 ? "it" : "them"} in under Keywords, then press Make.`;
}

// Every text with its fields filled. Values are inserted verbatim, never read as fields.
export function fillDocument(
  doc: DesignDocument,
  values: Readonly<Record<string, string>>,
): DesignDocument {
  return {
    ...doc,
    picture: { ...doc.picture, prompt: render(doc.picture.prompt, values) },
    text: {
      ...doc.text,
      blocks: doc.text.blocks.map((block) => ({ ...block, text: render(block.text, values) })),
    },
    ...(doc.brochure === undefined
      ? {}
      : {
          brochure: {
            ...doc.brochure,
            title: render(doc.brochure.title, values),
            body: render(doc.brochure.body, values),
          },
        }),
  };
}
