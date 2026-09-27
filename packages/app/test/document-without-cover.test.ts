import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { fakeImage } from "../src/adapters/fake/image.js";
import { providerError } from "../src/kernel/ports/model.js";
import { outputPath } from "../src/slices/storage/layout.js";
import { composedFixture, current, save, start } from "./revision-rebuild.fake.js";

// The document only borrows the thumbnail as its cover. A thumbnail that fails for good must
// not take the PDF down with it: the document is laid out without a cover instead.
it("makes the document without a cover when the thumbnail failed", async () => {
  const images = fakeImage();
  const h = await composedFixture({
    image: () => ({
      ...images,
      generate: async (request) => {
        if (request.prompt === "Cover")
          throw providerError({ kind: "refusal", message: "Fixture refusal" });
        return images.generate(request);
      },
    }),
  });
  try {
    const base = current(h.deps, h.projectId);
    await save(h.deps, h.projectId, {
      config: {
        ...base.revision.config,
        sources: {
          ...base.revision.config.sources,
          thumbnail: "from_prompt",
          images: "off",
          video: "off",
          document: "generate",
        },
        document: { theme: "plain" },
        thumbnailPrompt: "Cover",
        rendered: { ...base.revision.config.rendered, thumbnailPrompt: "Cover" },
      },
      content: { ...base.revision.content, imageOrder: [], imageDefinitions: {} },
    });

    await start(h.deps, h.projectId, ["thumbnail:image", "document:pdf"]);
    await h.runner.settled();

    const states = Object.fromEntries(
      h.deps.db
        .prepare("SELECT kind,state FROM stages WHERE project_id=?")
        .all(h.projectId)
        .map((row) => [String(row.kind), String(row.state)]),
    );
    expect(states.thumbnail).toBe("failed");
    expect(states.document).toBe("done");
    const view = current(h.deps, h.projectId);
    const pdf = view.outputs.find((row) => row.selected && row.output.role === "document_pdf");
    expect(pdf).toMatchObject({ state: "ready", available: true });
    const bytes = readFileSync(outputPath(h.deps.paths, h.projectId, pdf?.output.path ?? ""));
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    // No cover image went in.
    expect(bytes.toString("latin1")).not.toMatch(/\/Subtype \/Image/);
  } finally {
    await h.runner.settled();
    h.audioPreviews.close();
    h.close();
  }
});
