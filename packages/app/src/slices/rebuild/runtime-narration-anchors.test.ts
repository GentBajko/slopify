import { expect, it } from "vitest";
import { saveRevision } from "../revisions/mutations.js";
import { narrationFixture } from "./runtime-narration.fake.js";

// One sentence dropped from the top of the article re-voices the chunk it was in, not every
// chunk after it (sentences pack greedily, so a fresh cut moved every later boundary).
it("an article edit near the top re-cuts only the chunk it changed", async () => {
  const sentences = Array.from({ length: 10 }, (_, at) => `Paragraph ${String(at + 1)}.`);
  const h = await narrationFixture(sentences.join(" "), {
    config: { chunking: { mode: "characters", characters: 30 } },
  });
  try {
    await h.pump();
    const base = h.view();
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: base.revision.id,
      idempotencyKey: "drop-first",
      edit: {
        config: {
          ...base.revision.config,
          provided: { ...base.revision.config.provided, article: sentences.slice(1).join(" ") },
        },
        content: base.revision.content,
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    const chunks = (fingerprints: Readonly<Record<string, string>>) =>
      Object.keys(fingerprints).filter((key) => /^audio:body:[0-9a-f]+-[0-9]+:1$/u.test(key));
    const old = chunks(base.revision.fingerprints);
    const next = chunks(saved.view.revision.fingerprints);
    expect(next).toHaveLength(5);
    // Only the chunk the edit touched is new; the others keep their key, and so their audio.
    expect(next.filter((key) => !old.includes(key))).toHaveLength(1);
    expect(next.slice(1)).toEqual(old.slice(1));
  } finally {
    h.close();
  }
}, 30000);
