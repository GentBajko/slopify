import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { render } from "../admission/substitute.js";
import { fontAdvances, mappedCodepoints } from "../fonts/sfnt.js";
import type { CheckFont } from "./check-text.js";
import { designFields } from "./fields.js";
import { frames } from "./frames.js";
import { type LayoutFont, layoutText } from "./layout.js";
import { formatLabels } from "./model.js";
import type { DesignDocument } from "./schema.js";
import type { TemplateCheck } from "./template-checks.js";
import { templateRevision } from "./templates.js";

// What a schedule makes from a design template: its newest version marked ready, never an
// unchecked one, so editing a template never changes what a schedule makes until the new
// version passes its checks. And the checks Mark ready adds to the free ones that need the
// computer: the fonts, the provider, and each format drawn with the sample values.

export interface RunnableDesignVersion {
  readonly version: number;
  readonly name: string;
  readonly document: DesignDocument;
}

export function runnableDesignVersion(
  db: DatabaseSync,
  templateId: string,
): RunnableDesignVersion | undefined {
  const row = db
    .prepare(
      `SELECT r.version FROM design_template_revisions AS r
       JOIN design_templates AS t ON t.id = r.template_id
       WHERE r.template_id=? AND r.gate='ready' AND t.deleted_at IS NULL
       ORDER BY r.version DESC LIMIT 1`,
    )
    .get(templateId);
  if (row === undefined) return undefined;
  const version = z.object({ version: z.number() }).parse(row).version;
  const revision = templateRevision(db, templateId, version);
  return revision === undefined
    ? undefined
    : { version, name: revision.name, document: revision.document };
}

export interface CheckContext {
  // The font file behind a font id; undefined when it is no longer on this computer.
  readonly font: (fontId: string) => Promise<CheckFont | undefined>;
  // Null when the provider can be asked now; otherwise the sentence saying what to fix.
  readonly providerProblem: (provider: string) => Promise<string | null>;
}

export async function contextChecks(
  doc: DesignDocument,
  templateId: string,
  ctx: CheckContext,
): Promise<readonly TemplateCheck[]> {
  const at = (section: string, label = "Open") => ({
    label,
    href: `/library/design-templates/${templateId}#${section}`,
  });
  const checks: TemplateCheck[] = [];

  if (doc.picture.source === "generate") {
    const problem = await ctx.providerProblem(doc.picture.provider);
    checks.push({
      id: "provider",
      ok: problem === null,
      sentence: problem ?? "The image provider is ready.",
      fix:
        problem === null ? null : { label: "Open Providers", href: "/settings?section=providers" },
    });
  } else {
    const kept = doc.picture.sha256 !== undefined;
    checks.push({
      id: "provider",
      ok: kept,
      sentence: kept
        ? "The template's own picture is saved with it."
        : "This template uses its own picture, but none is saved with it. Upload one under Picture.",
      fix: kept ? null : at("picture"),
    });
  }

  const schedule = doc.schedule;
  if (schedule !== undefined) {
    const used = designFields(doc).includes(schedule.dateField);
    checks.push({
      id: "date-field",
      ok: used,
      sentence: used
        ? `Each row's date is read from {{${schedule.dateField}}}.`
        : `The schedule reads each date from {{${schedule.dateField}}}, but the template doesn't use that field. Choose a field it uses under Schedule.`,
      fix: used ? null : at("schedule"),
    });
  }

  // With the AI drawing the text, Slopify draws none, so there are no fonts to check.
  if (doc.picture.aiText) return checks;

  const fonts = new Map<string, CheckFont | undefined>();
  for (const block of doc.text.blocks)
    if (!fonts.has(block.fontId)) fonts.set(block.fontId, await ctx.font(block.fontId));
  const fontProblems: string[] = [];
  for (const [index, block] of doc.text.blocks.entries()) {
    const filled = render(block.text, doc.samples);
    if (filled.trim() === "") continue;
    const where = `text block ${String(index + 1)}`;
    const font = fonts.get(block.fontId);
    if (font === undefined) {
      fontProblems.push(
        `The font chosen for ${where} is no longer on this computer. Choose another font for it under Text layout.`,
      );
      continue;
    }
    const letters = [...new Set([...filled].filter((ch) => ch.trim() !== ""))];
    const found = mappedCodepoints(
      font.bytes,
      font.faceIndex,
      letters.map((ch) => ch.codePointAt(0) ?? 0),
    );
    const missing =
      found === undefined ? [] : letters.filter((ch) => !found.has(ch.codePointAt(0) ?? 0));
    if (missing.length > 0)
      fontProblems.push(
        `The font ${font.name} has no ${missing.map((ch) => `“${ch}”`).join(" ")} for the sample of ${where}. Choose another font for it under Text layout, or upload one that has ${missing.length === 1 ? "it" : "them"}.`,
      );
  }
  checks.push({
    id: "fonts",
    ok: fontProblems.length === 0,
    sentence: fontProblems[0] ?? "The fonts have every letter of the sample values.",
    fix: fontProblems.length === 0 ? null : at("text"),
  });

  const layoutFonts: Record<string, LayoutFont> = {};
  for (const [id, font] of fonts)
    if (font !== undefined)
      layoutFonts[id] = { assName: font.name, advance: fontAdvances(font.bytes, font.faceIndex) };
  const tooFull = doc.formats
    .map((entry) => entry.format)
    .filter((format) => layoutText(frames[format], doc.text, doc.samples, layoutFonts).overflow);
  checks.push({
    id: "formats",
    ok: tooFull.length === 0,
    sentence:
      tooFull.length === 0
        ? "The sample values fit on every format."
        : `The sample text doesn't fit on ${tooFull.map((format) => formatLabels[format]).join(", ")}, even at the smallest readable size. Shorten it or choose a placement with more room under Text layout.`,
    fix: tooFull.length === 0 ? null : at("text"),
  });
  return checks;
}
