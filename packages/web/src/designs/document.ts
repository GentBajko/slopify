import { type DesignFormat, designFormats, formatLabels } from "@app/slices/designs/model.js";
import type { DesignDocument, TextBlock } from "@app/slices/designs/schema.js";

// What a new designed piece starts as, and the small pure changes the design page and the
// template editor make to a document.

export const defaultImageModel = { provider: "fal", model: "fal-ai/flux-2" } as const;

// The formats a PDF is offered for; the rest download as pictures only.
export const pdfFormats: readonly DesignFormat[] = ["a4", "a3", "flyer", "brochure"];
export const pictureFormats: readonly DesignFormat[] = designFormats.filter(
  (format) => format !== "brochure",
);

export function blankDocument(
  source: "generate" | "picture",
  blocks: readonly Pick<TextBlock, "role" | "text">[] = [
    { role: "headline", text: "Your title" },
    { role: "details", text: "Date · Place" },
  ],
): DesignDocument {
  return {
    version: 1,
    picture: {
      source,
      prompt: "",
      castMemberIds: [],
      provider: defaultImageModel.provider,
      model: defaultImageModel.model,
      aiText: false,
    },
    text: {
      preset: "bottom-band",
      scrim: "band",
      blocks: blocks.map((block, index) => ({
        id: `b${String(index + 1)}`,
        role: block.role,
        text: block.text,
        fontId: "default",
        color: "#FFFFFF",
      })),
    },
    formats: [{ format: "a4", focus: { x: 0.5, y: 0.5 } }],
    samples: {},
  };
}

// A template's first version: fields where a piece's own words go, with sample values.
export function blankTemplate(): DesignDocument {
  const doc = blankDocument("generate", [
    { role: "headline", text: "{{Event}}" },
    { role: "details", text: "{{Date}} · {{Place}}" },
  ]);
  return {
    ...doc,
    picture: { ...doc.picture, prompt: "A poster background for {{Event}}, no text" },
    samples: { Event: "Midnight Jazz Session", Date: "2026-11-14", Place: "The Cellar" },
  };
}

export function nextBlockId(blocks: readonly TextBlock[]): string {
  let n = blocks.length + 1;
  while (blocks.some((block) => block.id === `b${String(n)}`)) n += 1;
  return `b${String(n)}`;
}

export function toggleFormat(doc: DesignDocument, format: DesignFormat): DesignDocument {
  const has = doc.formats.some((one) => one.format === format);
  if (has && doc.formats.length === 1) return doc;
  const formats = has
    ? doc.formats.filter((one) => one.format !== format)
    : designFormats
        .filter((one) => one === format || doc.formats.some((entry) => entry.format === one))
        .map(
          (one) =>
            doc.formats.find((entry) => entry.format === one) ?? {
              format: one,
              focus: { x: 0.5, y: 0.5 },
            },
        );
  const brochure = formats.some((one) => one.format === "brochure");
  const { brochure: _old, ...rest } = doc;
  return brochure
    ? { ...rest, formats, brochure: doc.brochure ?? defaultBrochure() }
    : { ...rest, formats };
}

function defaultBrochure(): NonNullable<DesignDocument["brochure"]> {
  return {
    title: "Programme",
    body: "## About\n\nWrite the brochure's inside pages here.",
    settings: { theme: "plain" },
  };
}

export function formatName(format: DesignFormat): string {
  return formatLabels[format];
}
