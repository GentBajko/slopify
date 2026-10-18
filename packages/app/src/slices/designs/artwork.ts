import type { DatabaseSync } from "node:sqlite";
import type { CastReference } from "../../kernel/ports/image.js";
import { castMemberById, imageBlob } from "../channels/repo.js";
import {
  designFields,
  fieldProblems,
  fillDocument,
  missingSentence,
  missingValues,
} from "./fields.js";
import { artworkAspect } from "./frames.js";
import type { DesignResult } from "./model.js";
import { type DesignDocument, designDocumentSchema } from "./schema.js";

// What a designed piece's artwork is asked for: its prompt with the fields filled, and, when
// the AI draws the text itself, that text spelled out word for word.

export interface ArtworkRequest {
  readonly prompt: string;
  readonly aspect: "16:9" | "9:16" | "1:1";
  readonly castMemberIds: readonly string[];
  readonly provider: string;
  readonly model: string;
}

export function artworkRequest(
  document: unknown,
  values: Readonly<Record<string, string>>,
): DesignResult<ArtworkRequest> {
  const parsed = designDocumentSchema.safeParse(document);
  if (!parsed.success)
    return {
      ok: false,
      reason: "invalid",
      message:
        "This design has no settings to make artwork from. Choose its picture, text and formats first.",
    };
  const doc: DesignDocument = parsed.data;
  if (doc.picture.source !== "generate")
    return {
      ok: false,
      reason: "invalid",
      message:
        "This design uses its own picture as the artwork, so there is nothing to make. Edit the picture instead, or switch Picture to Made by the AI.",
    };
  const problem = fieldProblems(doc)[0];
  if (problem !== undefined) return { ok: false, reason: "invalid", message: problem.sentence };
  const missing = missingValues(doc, values).filter((name) => detectedInPicture(doc, name));
  if (missing.length > 0)
    return { ok: false, reason: "missing-values", message: missingSentence(missing) };
  const filled = fillDocument(doc, values);
  const words = filled.text.blocks.map((block) => block.text.trim()).filter((text) => text !== "");
  const prompt =
    doc.picture.aiText && words.length > 0
      ? `${filled.picture.prompt}\n\nDraw this text into the picture as part of the design, spelled exactly as written, each line on its own:\n${words.map((line) => `"${line}"`).join("\n")}`
      : `${filled.picture.prompt}\n\nLeave room for a title and details to be set over the picture; draw no text, letters or logos.`;
  return {
    ok: true,
    value: {
      prompt,
      aspect: artworkAspect(doc.formats.map((one) => one.format)),
      castMemberIds: doc.picture.castMemberIds,
      provider: doc.picture.provider,
      model: doc.picture.model,
    },
  };
}

// The text fields only matter to the artwork when the AI draws the text.
function detectedInPicture(doc: DesignDocument, name: string): boolean {
  if (doc.picture.aiText) return designFields({ ...doc, brochure: undefined }).includes(name);
  return designFields({ ...doc, text: { ...doc.text, blocks: [] }, brochure: undefined }).includes(
    name,
  );
}

// Each chosen cast member with the pictures they have, in the order chosen.
export function castReferences(
  db: DatabaseSync,
  ids: readonly string[],
): DesignResult<readonly CastReference[]> {
  const references: CastReference[] = [];
  for (const id of ids) {
    const member = castMemberById(db, id);
    if (member === undefined)
      return {
        ok: false,
        reason: "invalid",
        message:
          "A cast member you chose was deleted. Choose the cast again, then press the button again.",
      };
    const images = member.images.flatMap((image) => {
      const blob =
        image.state === "ready" && image.sha256 !== null ? imageBlob(db, image.sha256) : undefined;
      return blob === undefined ? [] : [blob];
    });
    references.push({ name: member.name, description: member.description, images });
  }
  return { ok: true, value: references };
}
