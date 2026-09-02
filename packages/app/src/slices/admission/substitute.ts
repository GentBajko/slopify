// logic/03 §Q19-§Q21 fix the grammar: `{{` … `}}`, whitespace immediately inside the
// braces stripped, the name case-sensitive and free to hold anything but `{`, `}` and a
// newline (so `{{Middle of Words}}` is one name). There is no escape syntax. Hand-rolled
// on purpose (standards §Q2): a template library would bring its own grammar.

export const slotLintKinds = ["unclosed", "empty", "nested"] as const;
export type SlotLintKind = (typeof slotLintKinds)[number];

export interface SlotLintError {
  readonly kind: SlotLintKind;
  // Offset of the opening `{{`, so an editor can mark the body in place.
  readonly at: number;
}

export interface DetectedSlots {
  readonly names: readonly string[];
  readonly errors: readonly SlotLintError[];
}

export const fieldGroups = ["common", "text", "image"] as const;
export type FieldGroup = (typeof fieldGroups)[number];

export interface Field {
  readonly name: string;
  readonly group: FieldGroup;
}

// A well-formed slot: no brace and no newline between the delimiters.
const slot = /\{\{([^{}\n]*)\}\}/g;
const opener = "{{";
const closer = "}}";

export function detectSlots(body: string): DetectedSlots {
  const names: string[] = [];
  const errors: SlotLintError[] = [];
  let at = body.indexOf(opener);
  while (at !== -1) {
    // A name cannot span a line, so the search for the closer stops at the next newline.
    const newline = body.indexOf("\n", at + opener.length);
    const limit = newline === -1 ? body.length : newline;
    const close = body.indexOf(closer, at + opener.length);
    if (close === -1 || close > limit) {
      errors.push({ kind: "unclosed", at });
      at = body.indexOf(opener, at + opener.length);
      continue;
    }
    const inside = body.slice(at + opener.length, close);
    const name = inside.trim();
    if (inside.includes("{") || inside.includes("}")) {
      errors.push({ kind: "nested", at });
    } else if (name === "") {
      errors.push({ kind: "empty", at });
    } else if (!names.includes(name)) {
      names.push(name);
    }
    at = body.indexOf(opener, close + closer.length);
  }
  return { names, errors };
}

// logic/03 step 3: one field per distinct name; Common when a name is used on both
// sides, otherwise Text or Image. §Q24 fixes the order as first appearance, which is why
// both sides arrive as ordered lists of bodies rather than as sets.
export function collectFields(
  textBodies: readonly string[],
  imageBodies: readonly string[],
): readonly Field[] {
  const text = namesOf(textBodies);
  const image = namesOf(imageBodies);
  const fields: Field[] = [];
  for (const name of [...text, ...image]) {
    if (fields.some((field) => field.name === name)) {
      continue;
    }
    const onText = text.includes(name);
    const onImage = image.includes(name);
    fields.push({ name, group: onText && onImage ? "common" : onText ? "text" : "image" });
  }
  return fields;
}

// logic/03 step 5 and §Q21: one pass, so a value that itself contains `{{x}}` lands in
// the output verbatim and is never looked at again. A name with no value is left as it
// was written; scenario 04 refuses the run before this can reach a provider.
export function render(body: string, values: Readonly<Record<string, string>>): string {
  return body.replace(slot, (whole: string, inside: string): string => {
    const value = values[inside.trim()];
    return value === undefined ? whole : value;
  });
}

function namesOf(bodies: readonly string[]): readonly string[] {
  const names: string[] = [];
  for (const body of bodies) {
    for (const name of detectSlots(body).names) {
      if (!names.includes(name)) {
        names.push(name);
      }
    }
  }
  return names;
}
