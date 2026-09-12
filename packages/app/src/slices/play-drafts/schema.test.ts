import { expect, it } from "vitest";
import { draftFixture } from "./draft.fake.js";
import { playDraftDocumentSchema } from "./schema.js";

it("rejects unknown fields and unsupported versions without coercing draft numbers", () => {
  const h = draftFixture();
  try {
    expect(playDraftDocumentSchema.safeParse({ ...h.document, schemaVersion: 2 }).success).toBe(
      false,
    );
    expect(playDraftDocumentSchema.safeParse({ ...h.document, secret: "no" }).success).toBe(false);
    expect(
      playDraftDocumentSchema.parse({ ...h.document, expectedWords: " invalid " }).expectedWords,
    ).toBe(" invalid ");
  } finally {
    h.close();
  }
});
