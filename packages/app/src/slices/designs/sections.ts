import { detectSlots } from "../admission/substitute.js";
import type { DesignDocument } from "./schema.js";

// The design template editor's sections, and which ones a Save changed. Pure and browser-safe:
// the page shows the cost on Save only when the Picture changed, because that is the only
// section whose sample is paid (one artwork); text, formats and the schedule redraw for free.

export const designSections = [
  { id: "picture", label: "Picture" },
  { id: "text", label: "Text layout" },
  { id: "formats", label: "Formats" },
  { id: "schedule", label: "Schedule" },
] as const;
export type DesignSectionId = (typeof designSections)[number]["id"];

// Every key of the document belongs to one section; a new key must be added here, which the
// test that walks the schema's keys enforces.
export const sectionOfKey: Readonly<Record<keyof DesignDocument, DesignSectionId | null>> = {
  version: null,
  picture: "picture",
  text: "text",
  samples: "text",
  formats: "formats",
  brochure: "formats",
  schedule: "schedule",
};

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export function designAffectedSections(
  before: DesignDocument,
  after: DesignDocument,
): readonly DesignSectionId[] {
  const changed = new Set<DesignSectionId>();
  for (const key of Object.keys(sectionOfKey) as (keyof DesignDocument)[]) {
    const section = sectionOfKey[key];
    if (section !== null && !same(before[key], after[key])) changed.add(section);
  }
  // The artwork's prompt is filled from the sample values, so a changed sample that the
  // prompt uses changes the picture too.
  if (!same(before.samples, after.samples) && promptUsesChangedSample(before, after))
    changed.add("picture");
  return designSections.map((section) => section.id).filter((id) => changed.has(id));
}

function promptUsesChangedSample(before: DesignDocument, after: DesignDocument): boolean {
  if (after.picture.source !== "generate") return false;
  return detectSlots(after.picture.prompt).names.some(
    (name) => before.samples[name] !== after.samples[name],
  );
}

// Whether a Save with these changes makes a paid picture for the sample.
export function sampleNeedsPicture(affected: readonly DesignSectionId[]): boolean {
  return affected.includes("picture");
}
