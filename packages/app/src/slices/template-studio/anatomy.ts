import { filledKeywords } from "../admission/substitute.js";

// The prompt anatomy: a template prompt as it was sent, cut into what the person wrote, what
// their keywords filled, what Slopify filled itself (every name in `filledKeywords`, whatever
// the keywords feature adds to it) and what a setting added. The segments cover the body once,
// in order, so read together they are the prompt.

export type SegmentOrigin = "yours" | "keyword" | "slopify" | "setting";

export interface Segment {
  readonly origin: SegmentOrigin;
  readonly text: string;
  // The keyword a filled segment stands for.
  readonly name?: string | undefined;
  // A keyword with no value yet: Slopify fills it when the step runs, or the person must.
  readonly unfilled?: true | undefined;
}

export interface AnatomyInput {
  // The prompt as written in the Library, with its {{Keyword}} slots.
  readonly body: string;
  // The prompt as it was sent, when one was; the values are read back from it.
  readonly sent?: string | undefined;
  // The run's keyword values, for what the sent prompt doesn't show.
  readonly values: Readonly<Record<string, string>>;
  // Names Slopify fills itself. Defaults to every name `admission/substitute.ts` lists.
  readonly filled?: readonly string[] | undefined;
  // What settings put after the prompt (the sample's own limit, the language), in order.
  readonly appended?: readonly { readonly text: string; readonly by: "slopify" | "setting" }[];
}

const slot = /\{\{([^{}\n]*)\}\}/gu;

interface Part {
  readonly literal?: string;
  readonly name?: string;
}

function partsOf(body: string): readonly Part[] {
  const parts: Part[] = [];
  let last = 0;
  for (const match of body.matchAll(slot)) {
    const at = match.index;
    if (at > last) parts.push({ literal: body.slice(last, at) });
    const name = (match[1] ?? "").trim();
    parts.push(name === "" ? { literal: match[0] } : { name });
    last = at + match[0].length;
  }
  if (last < body.length) parts.push({ literal: body.slice(last) });
  return parts;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

// Each keyword's value as the sent prompt shows it: the body's own text around the slots is
// matched in the sent text, and what lies between is the value. Undefined when the sent prompt
// isn't this body filled in (the prompt was edited by hand, or it is another version's).
export function sentValues(
  body: string,
  sent: string,
): Readonly<Record<string, string>> | undefined {
  const parts = partsOf(body);
  const names: string[] = [];
  const pattern = parts
    .map((part) => {
      if (part.name === undefined) return escape(part.literal ?? "");
      names.push(part.name);
      return "([\\s\\S]*?)";
    })
    .join("");
  const match = new RegExp(`^${pattern}$`, "u").exec(sent);
  if (match === null) return undefined;
  const values: Record<string, string> = Object.create(null) as Record<string, string>;
  names.forEach((name, index) => {
    const value = match[index + 1] ?? "";
    if (!Object.hasOwn(values, name)) values[name] = value;
  });
  return values;
}

export function promptAnatomy(input: AnatomyInput): readonly Segment[] {
  const filled = input.filled ?? filledKeywords;
  const read = input.sent === undefined ? undefined : sentValues(input.body, input.sent);
  const valueOf = (name: string): string | undefined => {
    const shown = read?.[name];
    // A slot the sent prompt still shows as written was never filled.
    if (shown !== undefined && shown !== `{{${name}}}`) return shown;
    return Object.hasOwn(input.values, name) && input.values[name] !== ""
      ? input.values[name]
      : undefined;
  };
  const segments: Segment[] = [];
  for (const part of partsOf(input.body)) {
    if (part.name === undefined) {
      const text = part.literal ?? "";
      if (text !== "") segments.push({ origin: "yours", text });
      continue;
    }
    const value = valueOf(part.name);
    const origin = filled.includes(part.name) ? "slopify" : "keyword";
    segments.push(
      value === undefined
        ? { origin, name: part.name, text: `{{${part.name}}}`, unfilled: true }
        : { origin, name: part.name, text: value },
    );
  }
  for (const extra of input.appended ?? [])
    segments.push({ origin: extra.by, text: `\n\n${extra.text}` });
  return segments;
}
