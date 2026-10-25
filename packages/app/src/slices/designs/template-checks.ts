import { designFields, fieldProblems } from "./fields.js";
import type { DesignDocument } from "./schema.js";

// What must hold before a design template version can be marked ready, each check one
// sentence and the place to fix it. These are the free checks a Save can run at once; the
// template editor adds the ones that read fonts or providers (`CheckContext`).

export interface TemplateCheck {
  readonly id: string;
  readonly ok: boolean;
  readonly sentence: string;
  readonly fix: { readonly label: string; readonly href: string } | null;
}

const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/;

export function validDate(value: string): boolean {
  const match = isoDate.exec(value.trim());
  if (match === null) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
  return date.getUTCFullYear() === y && date.getUTCMonth() + 1 === m && date.getUTCDate() === d;
}

export function documentChecks(doc: DesignDocument, templateId: string): readonly TemplateCheck[] {
  const at = (section: string) => ({
    label: "Open",
    href: `/library/design-templates/${templateId}#${section}`,
  });
  const problems = fieldProblems(doc);
  const missing = designFields(doc).filter((name) => (doc.samples[name] ?? "").trim() === "");
  const dateField = doc.schedule?.dateField;
  const sampleDate = dateField === undefined ? undefined : doc.samples[dateField];
  return [
    {
      id: "fields",
      ok: problems.length === 0,
      sentence: problems[0]?.sentence ?? "Every keyword is written as {{Name}}.",
      fix: problems.length === 0 ? null : at("text"),
    },
    {
      id: "samples",
      ok: missing.length === 0,
      sentence:
        missing.length === 0
          ? "Every keyword has a sample value."
          : `${missing.map((name) => `{{${name}}}`).join(", ")} ${missing.length === 1 ? "has" : "have"} no sample value. Fill ${missing.length === 1 ? "it" : "them"} in under Text → Sample values.`,
      fix: missing.length === 0 ? null : at("text"),
    },
    {
      id: "dates",
      ok: sampleDate === undefined || validDate(sampleDate),
      sentence:
        sampleDate === undefined || validDate(sampleDate)
          ? "Dates read as YYYY-MM-DD."
          : `The sample {{${dateField ?? ""}}} "${sampleDate}" isn't a date written YYYY-MM-DD (for example 2026-11-14). Write it that way under Text → Sample values.`,
      fix: sampleDate === undefined || validDate(sampleDate) ? null : at("text"),
    },
  ];
}
