import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import { narrationCatalogue } from "../src/slices/rebuild/runtime-narration.fake.js";
import { outputPath } from "../src/slices/storage/layout.js";
import { composedFixture, current, save, start } from "./revision-rebuild.fake.js";

it.each([
  ["shorter", ["First"], false],
  ["unchanged", ["First", "Second"], false],
  ["longer", ["First", "Second", "Third"], false],
  ["renamed", ["Replacement", "Another"], false],
  ["shorter before article", ["First"], true],
] as const)(
  "rebuilds research with a %s outline without old findings",
  async (_label, nextOutline, withArticle) => {
    let round = 1;
    const calls: { readonly kind: string; readonly round: number; readonly text: string }[] = [];
    const llm = fakeLlm({
      reply: (req) => {
        const text = req.messages.map((message) => message.content).join("\n");
        const kind = text.includes("You are planning the web research")
          ? "planner"
          : text.includes("You are researching one chapter")
            ? "chapter"
            : text.includes("You are the editor of the research")
              ? "synthesis"
              : "article";
        calls.push({ kind, round, text });
        if (kind === "planner")
          return [(round === 1 ? ["First", "Second"] : nextOutline).join("\n")];
        if (kind === "chapter")
          return [`Finding from round ${round}.\nSources\nhttps://example.test`];
        if (kind === "article") return ["# Article\nFinal article."];
        return [`Final notes ${round}.\nSources\nhttps://example.test`];
      },
    });
    const h = await composedFixture({ llm: () => llm });
    try {
      h.setCatalogue({
        ...h.deps.catalogue.read(),
        providers: { ...h.deps.catalogue.read().providers, ...narrationCatalogue.providers },
        llm: narrationCatalogue.llm.map((model) => ({
          ...model,
          llm: { ...model.llm, webSearch: true },
        })),
      });
      const base = current(h.deps, h.projectId);
      await save(h.deps, h.projectId, {
        config: {
          ...base.revision.config,
          sources: {
            ...base.revision.config.sources,
            research: "generate",
            article: "generate",
            images: "off",
          },
          llm: { provider: "openrouter", model: "llm" },
          rendered: { article: "Original prompt" },
        },
        content: {
          ...base.revision.content,
          articleMarkdown: undefined,
          articleEdited: false,
          imageOrder: [],
          imageDefinitions: {},
        },
      });
      await start(h.deps, h.projectId, ["research:notes"]);
      await h.runner.settled();
      const first = current(h.deps, h.projectId);
      const oldNotes = first.outputs.find(
        (row) => row.workKey === "research:notes" && row.selected && row.state === "ready",
      );
      if (oldNotes === undefined) throw new Error("Research did not finish.");
      const oldPath = outputPath(h.deps.paths, h.projectId, oldNotes.output.path);
      const bytes = readFileSync(oldPath);
      round = 2;
      await save(h.deps, h.projectId, {
        config: {
          ...first.revision.config,
          rendered: { ...first.revision.config.rendered, article: "Changed prompt" },
        },
        content: first.revision.content,
        regenerate: ["research:planner", "research:notes"],
      });
      await start(h.deps, h.projectId, [withArticle ? "article:body" : "research:notes"]);
      await h.runner.settled();
      const second = calls.filter((call) => call.round === 2);
      expect(second.filter((call) => call.kind === "planner")).toHaveLength(1);
      expect(second.filter((call) => call.kind === "chapter")).toHaveLength(nextOutline.length);
      const synthesis = second.filter((call) => call.kind === "synthesis");
      expect(synthesis).toHaveLength(1);
      expect(synthesis[0]?.text).not.toContain("Finding from round 1.");
      for (const title of nextOutline) expect(synthesis[0]?.text).toContain(title);
      expect(synthesis[0]?.text.match(/Finding from round 2\./g)).toHaveLength(nextOutline.length);
      const after = current(h.deps, h.projectId);
      const notes = after.outputs.find(
        (row) => row.workKey === "research:notes" && row.selected && row.state === "ready",
      );
      expect(notes?.assetId).not.toBe(oldNotes.assetId);
      expect(notes).toBeDefined();
      expect(
        after.outputs.some(
          (row) => row.workKey === "article:body" && row.selected && row.state === "ready",
        ),
      ).toBe(withArticle);
      const articles = second.filter((call) => call.kind === "article");
      expect(articles).toHaveLength(withArticle ? 1 : 0);
      if (withArticle) {
        expect(articles[0]?.text).toContain("Final notes 2.");
        expect(articles[0]?.text).not.toContain("Final notes 1.");
      }
      expect(readFileSync(oldPath)).toEqual(bytes);
    } finally {
      await h.runner.settled();
      h.audioPreviews.close();
      h.close();
    }
  },
);
