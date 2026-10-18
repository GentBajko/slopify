import type { DatabaseSync } from "node:sqlite";
import { imageBlob } from "../channels/repo.js";
import { fillDocument, missingSentence, missingValues } from "./fields.js";
import { type DesignFormat, type DesignResult, formatLabels } from "./model.js";
import { type DesignDocument, designDocumentSchema } from "./schema.js";
import { designView } from "./service.js";

// What a render needs, read and checked: the design's settings, its current artwork and its
// values, or the sentence that says why it can't be drawn yet.

export interface Prepared {
  readonly doc: DesignDocument;
  readonly art: {
    readonly bytes: Uint8Array;
    readonly mime: "image/png" | "image/jpeg";
    readonly width: number;
    readonly height: number;
    readonly sha256: string;
  };
  readonly values: Readonly<Record<string, string>>;
}

export function prepare(
  db: DatabaseSync,
  designId: string,
  format: DesignFormat,
): DesignResult<Prepared> {
  const design = designView(db, designId);
  if (design === undefined)
    return {
      ok: false,
      reason: "not-found",
      message: "This design no longer exists. Open Library → Designs to choose another.",
    };
  const parsed = designDocumentSchema.safeParse(design.document);
  if (!parsed.success)
    return {
      ok: false,
      reason: "invalid",
      message:
        "This picture has no formats yet. Press Turn into a designed piece to add text and formats, or download the picture itself.",
    };
  if (!parsed.data.formats.some((one) => one.format === format))
    return {
      ok: false,
      reason: "invalid",
      message: `${formatLabels[format]} isn't ticked for this design. Tick it under Formats, then download again.`,
    };
  const head = design.steps.find((step) => step.id === design.headStepId);
  const blob = head === undefined || head.sha256 === null ? undefined : imageBlob(db, head.sha256);
  if (
    head === undefined ||
    blob === undefined ||
    head.width === null ||
    head.height === null ||
    head.sha256 === null
  )
    return {
      ok: false,
      reason: "not-ready",
      message: "This design has no artwork yet. Press Make to draw it, then download again.",
    };
  const missing = missingValues(
    { ...parsed.data, picture: { ...parsed.data.picture, prompt: "" } },
    design.values,
  );
  if (missing.length > 0)
    return { ok: false, reason: "missing-values", message: missingSentence(missing) };
  return {
    ok: true,
    value: {
      doc: parsed.data,
      values: design.values,
      art: { ...blob, width: head.width, height: head.height, sha256: head.sha256 },
    },
  };
}

export function fileName(
  doc: DesignDocument,
  values: Readonly<Record<string, string>>,
  format: DesignFormat,
): string {
  const headline =
    fillDocument(doc, values).text.blocks.find((block) => block.text.trim() !== "")?.text ??
    "design";
  const safe =
    headline
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "design";
  return `${safe}-${format}`;
}
