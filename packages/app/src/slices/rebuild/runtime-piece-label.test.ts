import { expect, it } from "vitest";
import { exportFixture } from "./runtime-export.fake.js";
import { pieceLabel } from "./runtime-piece-label.js";

it("names a failed step the way the project page and editor do", async () => {
  const h = await exportFixture();
  try {
    const { context } = h.grant("subtitles:cues");
    const label = (key: string) => pieceLabel(h.deps, context, { key });
    h.deps.db
      .prepare(
        "UPDATE project_revisions SET content=json_set(content,'$.imageOrder',json('[\"harbor\",\"hill\"]')) WHERE id=?",
      )
      .run(context.work.revisionId);
    expect(label("image:hill")).toBe("Image 2");
    expect(label("image:gone")).toBe("An image");
    expect(label("thumbnail:image")).toBe("Thumbnail");
    expect(label("research:chapter:4")).toBe("Research topic 4");
    expect(label("article:body")).toBe("Article");
    expect(label("entry:outro:text")).toBe("Outro text");
    expect(label("audio:intro")).toBe("Intro narration");
    expect(label("narration:prepare:intro:audio:intro")).toBe("Intro narration");
    // Captions and export name their own place in their messages.
    expect(label("subtitles:timing")).toBeUndefined();
    expect(label("export:video")).toBeUndefined();
  } finally {
    h.close();
  }
});
