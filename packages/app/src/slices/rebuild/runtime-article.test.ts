import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Catalogue } from "../../catalog/schema.js";
import type { ProjectEvent } from "../../kernel/events.js";
import { stageKinds } from "../../kernel/pipeline.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StageProviders } from "../../kernel/runner/providers.js";
import { claimWork, maySubmit } from "../../kernel/runner/work-authority.js";
import { ensureBaseline } from "../revisions/adopt.js";
import { saveRevision } from "../revisions/mutations.js";
import { revisionFixture } from "../revisions/revision.fake.js";
import { getRevisionView } from "../revisions/view.js";
import { outputPath } from "../storage/layout.js";
import { admitInitialRevision } from "./runtime-admission.js";
import { executeProviderRecipe } from "./runtime-provider.js";
import { executionStages } from "./runtime-store.js";
import { workPieces } from "./work-records.js";

const catalogue: Catalogue = {
  schemaVersion: 1,
  updatedAt: "2026-09-12",
  providers: { openrouter: { maxConcurrent: 5 } },
  image: [],
  tts: [],
  llm: [
    {
      provider: "openrouter",
      id: "text",
      name: "Text",
      enabled: true,
      deprecated: false,
      source: "https://example.test",
      keywords: [],
      pricing: {},
      llm: { webSearch: true },
    },
  ],
};
async function fixture() {
  const h = revisionFixture();
  const config = {
    ...h.config,
    sources: { ...h.config.sources, article: "generate" as const },
    llm: { provider: "openrouter", model: "text" },
    provided: {},
    rendered: { article: "Write" },
  };
  h.deps.db
    .prepare("UPDATE projects SET config=? WHERE id=?")
    .run(JSON.stringify(config), h.projectId);
  for (const kind of stageKinds)
    h.deps.db
      .prepare(
        "INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,?,?,'generate','pending')",
      )
      .run(kind, h.projectId, kind);
  const baseline = await ensureBaseline(h.deps, h.projectId);
  if (!baseline.ok) throw new Error("Expected baseline");
  admitInitialRevision(h.deps, baseline.view, catalogue);
  const stage = executionStages(h.deps, h.projectId).find((row) => row.kind === "article");
  if (stage === undefined) throw new Error("Missing article");
  const piece = workPieces(h.deps.db, stage.work.workId)[0];
  if (piece === undefined) throw new Error("Missing request");
  claimWork(h.deps.db, stage.work);
  const context: StageContext = {
    stage,
    work: stage.work,
    signal: new AbortController().signal,
    maySubmit: (id) => maySubmit(h.deps.db, stage.work, id),
    emit: () => {},
  };
  return { ...h, baseline: baseline.view, stage, piece, context };
}

describe("owned article continuations", () => {
  it("gives each continuation an exact durable request and publishes the assembled article", async () => {
    const h = await fixture();
    try {
      const bound: string[] = [];
      const providers: StageProviders = {
        llm: async (call) => {
          const continuation = call.messages.length > 1;
          if (continuation) expect(call.messages[1]?.content).toBe("First ");
          return {
            ok: true,
            value: {
              text: continuation ? "last." : "First ",
              finishReason: continuation ? "stop" : "length",
              usage: { inputTokens: 2, outputTokens: 3 },
            },
          };
        },
        tts: async () => {
          throw new Error("Unexpected TTS");
        },
        image: async () => {
          throw new Error("Unexpected image");
        },
        forPiece: (id) => {
          bound.push(id);
          return providers;
        },
      };
      const count = vi.fn();
      expect(await executeProviderRecipe({ ...h.deps, count }, h.context, providers, h.piece)).toBe(
        "done",
      );
      expect(count).toHaveBeenCalledExactlyOnceWith("stage.completed", {
        stage: "article",
        provider: "openrouter",
        model: "text",
        tokensIn: 4,
        tokensOut: 6,
      });
      const pieces = workPieces(h.deps.db, h.stage.work.workId);
      expect(pieces.map((piece) => piece.key)).toEqual(["article:body", "article:continuation:1"]);
      expect(new Set(bound).size).toBe(2);
      const instructions = getRevisionView(
        h.deps,
        h.projectId,
        h.baseline.revision.id,
      )?.outputs.find((row) => row.selected && row.output.role === "instructions");
      if (instructions === undefined) throw new Error("Missing frozen instructions");
      const text = readFileSync(
        outputPath(h.deps.paths, h.projectId, instructions.output.path),
        "utf8",
      );
      expect(text).toContain("## Article\n\n### user\n\nWrite");
      expect(text).toContain("## Article continuation 1");
      expect(text).toContain("First ");
      expect(getRevisionView(h.deps, h.projectId, h.baseline.revision.id)?.articleMarkdown).toBe(
        "First last.",
      );
    } finally {
      h.close();
    }
  });

  it("keeps an accepted partial answer and holds its next request after an article edit", async () => {
    const h = await fixture();
    try {
      let calls = 0;
      const providers: StageProviders = {
        llm: async () => {
          calls += 1;
          const saved = await saveRevision(h.deps, {
            projectId: h.projectId,
            baseRevisionId: h.baseline.revision.id,
            idempotencyKey: "new-article",
            edit: {
              config: { ...h.baseline.revision.config, rendered: { article: "Different article" } },
              content: h.baseline.revision.content,
            },
          });
          if (!saved.ok) throw new Error(JSON.stringify(saved));
          return {
            ok: true,
            value: { text: "Partial result", finishReason: "length", usage: null },
          };
        },
        tts: async () => {
          throw new Error("Unexpected TTS");
        },
        image: async () => {
          throw new Error("Unexpected image");
        },
        forPiece: () => providers,
      };
      expect(await executeProviderRecipe(h.deps, h.context, providers, h.piece)).toBe("held");
      expect(calls).toBe(1);
      expect(workPieces(h.deps.db, h.stage.work.workId)).toHaveLength(1);
      expect(
        h.deps.db.prepare("SELECT result_json FROM revision_work_pieces WHERE id=?").get(h.piece.id)
          ?.result_json,
      ).toContain("Partial result");
    } finally {
      h.close();
    }
  });
});

// A text model that answers every call with `answer`, holding it to the request's own check the
// way the attempt wrapper does: an unusable answer throws its sentence.
function answering(
  answer: (call: number) => { readonly text: string; readonly finishReason: string },
  onDelta?: (text: string) => void,
  seen: (readonly { readonly role: string; readonly content: string }[])[] = [],
): StageProviders & { readonly calls: () => number } {
  let calls = 0;
  const providers: StageProviders & { readonly calls: () => number } = {
    calls: () => calls,
    llm: async (call, onEvent) => {
      calls += 1;
      seen.push(call.messages);
      const value = { ...answer(calls), usage: null };
      for (const piece of value.text.match(/.{1,6}/gs) ?? []) {
        onDelta?.(piece);
        onEvent?.({ type: "delta", text: piece });
      }
      const issue = call.check?.(value);
      if (issue !== undefined) throw new Error(issue);
      return { ok: true, value };
    },
    tts: async () => {
      throw new Error("Unexpected TTS");
    },
    image: async () => {
      throw new Error("Unexpected image");
    },
    forPiece: () => providers,
  };
  return providers;
}

describe("the written article", () => {
  it("stores the markdown as written and the narration source, sources and glossary apart", async () => {
    const h = await fixture();
    try {
      const markdown =
        "# Rope\n\nRope is **twisted** fibre.\n\n## Sources Consulted\n\n- https://example.test/rope\n\n## Pronunciation Glossary\n\n- bowline /ˈboʊlɪn/\n";
      const providers = answering(() => ({ text: markdown, finishReason: "stop" }));
      expect(await executeProviderRecipe(h.deps, h.context, providers, h.piece)).toBe("done");
      const view = getRevisionView(h.deps, h.projectId, h.baseline.revision.id);
      const selected = (view?.outputs ?? []).filter((row) => row.selected);
      expect(selected.map((row) => row.output.role).sort()).toEqual([
        "article_md",
        "article_txt",
        "glossary",
        "instructions",
        "sources",
      ]);
      const read = (role: string) => {
        const row = selected.find((one) => one.output.role === role);
        if (row === undefined) throw new Error(`Missing ${role}`);
        return readFileSync(outputPath(h.deps.paths, h.projectId, row.output.path), "utf8");
      };
      expect(read("article_md")).toBe(markdown);
      expect(read("article_txt")).toBe("Rope\n\nRope is twisted fibre.\n");
      expect(read("sources")).toContain("- https://example.test/rope");
      expect(read("sources")).not.toContain("bowline");
      expect(read("glossary")).toContain("- bowline /ˈboʊlɪn/");
      expect(read("article_txt")).not.toContain("example.test");
    } finally {
      h.close();
    }
  });

  it("writes no sources or glossary file when the article has neither section", async () => {
    const h = await fixture();
    try {
      const providers = answering(() => ({ text: "# Rope\n\nAll of it.\n", finishReason: "stop" }));
      expect(await executeProviderRecipe(h.deps, h.context, providers, h.piece)).toBe("done");
      const roles = (getRevisionView(h.deps, h.projectId, h.baseline.revision.id)?.outputs ?? [])
        .filter((row) => row.selected)
        .map((row) => row.output.role);
      expect(roles).not.toContain("sources");
      expect(roles).not.toContain("glossary");
      expect(roles).toContain("article_txt");
    } finally {
      h.close();
    }
  });

  it("streams every piece of the article into the page as it arrives, in order", async () => {
    const h = await fixture();
    try {
      const emitted: ProjectEvent[] = [];
      const sent: string[] = [];
      const providers = answering(
        () => ({ text: "Rope is older than writing.", finishReason: "stop" }),
        (text) => void sent.push(text),
      );
      const context: StageContext = { ...h.context, emit: (event) => void emitted.push(event) };
      expect(await executeProviderRecipe(h.deps, context, providers, h.piece)).toBe("done");
      const deltas = emitted.filter((event) => event.type === "article.delta");
      expect(sent.length).toBeGreaterThan(1);
      expect(deltas.map((event) => (event.type === "article.delta" ? event.text : ""))).toEqual(
        sent,
      );
      expect(deltas.every((event) => event.projectId === h.projectId)).toBe(true);
    } finally {
      h.close();
    }
  });

  it("fails an article still unfinished after three continuations", async () => {
    const h = await fixture();
    try {
      const providers = answering(() => ({ text: "on and on ", finishReason: "length" }));
      await expect(executeProviderRecipe(h.deps, h.context, providers, h.piece)).rejects.toThrow(
        /still unfinished after 3 continuations/,
      );
      expect(providers.calls()).toBe(4);
      expect(workPieces(h.deps.db, h.stage.work.workId).map((piece) => piece.key)).toEqual([
        "article:body",
        "article:continuation:1",
        "article:continuation:2",
        "article:continuation:3",
      ]);
      expect(
        getRevisionView(h.deps, h.projectId, h.baseline.revision.id)?.outputs.some(
          (row) => row.selected && row.output.role === "article_md",
        ),
      ).toBe(false);
    } finally {
      h.close();
    }
  });

  it("refuses an empty article answer and stores nothing", async () => {
    const h = await fixture();
    try {
      const providers = answering(() => ({ text: " \n ", finishReason: "stop" }));
      await expect(executeProviderRecipe(h.deps, h.context, providers, h.piece)).rejects.toThrow(
        /empty article/,
      );
      expect(
        getRevisionView(h.deps, h.projectId, h.baseline.revision.id)?.outputs.some(
          (row) => row.selected && row.output.role === "article_md",
        ),
      ).toBe(false);
    } finally {
      h.close();
    }
  });

  it("hands each continuation everything written so far and joins the pieces as they came", async () => {
    const h = await fixture();
    try {
      const seen: (readonly { readonly role: string; readonly content: string }[])[] = [];
      const parts = [
        { text: "one", finishReason: "length" },
        { text: " two", finishReason: "length" },
        { text: " three", finishReason: "stop" },
      ];
      const providers = answering(
        (call) => parts[call - 1] ?? { text: "", finishReason: "stop" },
        undefined,
        seen,
      );
      expect(await executeProviderRecipe(h.deps, h.context, providers, h.piece)).toBe("done");
      expect(seen[2]?.[1]).toEqual({ role: "assistant", content: "one two" });
      expect(seen[2]?.at(-1)?.content).toContain("Do not repeat");
      expect(getRevisionView(h.deps, h.projectId, h.baseline.revision.id)?.articleMarkdown).toBe(
        "one two three",
      );
    } finally {
      h.close();
    }
  });

  it("refuses an empty continuation", async () => {
    const h = await fixture();
    try {
      const providers = answering((call) =>
        call === 1
          ? { text: "the start", finishReason: "length" }
          : { text: "", finishReason: "stop" },
      );
      await expect(executeProviderRecipe(h.deps, h.context, providers, h.piece)).rejects.toThrow(
        /empty article/,
      );
    } finally {
      h.close();
    }
  });
});
