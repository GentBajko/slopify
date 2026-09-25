import { expect, it } from "vitest";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import { providerError } from "../src/kernel/ports/model.js";
import { recipe } from "../src/slices/rebuild/recipe-model.js";
import { narrationCatalogue } from "../src/slices/rebuild/runtime-narration.fake.js";
import { previewRebuild } from "../src/slices/rebuild/service.js";
import { workPieces } from "../src/slices/rebuild/work-records.js";
import { composedFixture, current, save, start } from "./revision-rebuild.fake.js";

async function fixture(key: "research:notes" | "article:body") {
  let fail = true;
  const calls: string[] = [];
  const llm = fakeLlm({
    reply: (req) => {
      const text = req.messages.map((message) => message.content).join("\n");
      const kind = text.includes("You are planning the web research")
        ? "planner"
        : text.includes("You are researching one chapter")
          ? "chapter"
          : text.includes("You are the editor of the research")
            ? "research:notes"
            : "article:body";
      calls.push(kind);
      if (kind === key && fail)
        throw providerError({ kind: "unavailable", message: "Legacy request failed" });
      if (kind === "planner") return ["First\nSecond"];
      if (kind === "chapter") return ["Original report\nSources\nhttps://example.test"];
      expect(req.documents?.filter((doc) => doc.id.startsWith("research-"))).toHaveLength(2);
      return [
        kind === "research:notes"
          ? "Editorial notes\nSources\nhttps://example.test"
          : "# Article\nFinished.",
      ];
    },
  });
  const h = await composedFixture({ llm: () => llm });
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
      rendered: { article: "Write a history" },
    },
    content: {
      ...base.revision.content,
      articleMarkdown: undefined,
      articleEdited: false,
      imageOrder: [],
      imageDefinitions: {},
    },
  });
  await start(h.deps, h.projectId, [key]);
  await h.runner.settled();
  const row = h.deps.db
    .prepare("SELECT * FROM revision_work_reservations WHERE work_key=?")
    .get(key);
  if (!row) throw new Error("Missing reservation");
  const piece = workPieces(h.deps.db, String(row.work_id))[0];
  if (piece?.input.kind !== "llm") throw new Error("Missing LLM input");
  const { documents, ...input } = piece.input;
  const legacy = recipe(
    { content: current(h.deps, h.projectId).revision.content },
    key,
    key === "research:notes" ? "research" : "article",
    {
      ...input,
      messages: [
        ...input.messages,
        { role: "user", content: documents?.map((doc) => doc.content).join("\n") ?? "" },
      ],
    },
  );
  h.deps.db
    .prepare(
      "UPDATE revision_work_pieces SET input_json=?,fingerprint=?,request_fingerprint=? WHERE id=?",
    )
    .run(JSON.stringify(legacy.input), legacy.fingerprint, legacy.requestFingerprint, piece.id);
  h.deps.db
    .prepare("UPDATE revision_work SET fingerprint=? WHERE id=?")
    .run(legacy.fingerprint, piece.workId);
  h.deps.db
    .prepare("UPDATE revision_work_reservations SET fingerprint=? WHERE piece_id=?")
    .run(legacy.fingerprint, piece.id);
  fail = false;
  calls.length = 0;
  return {
    ...h,
    calls,
    piece,
    legacy,
    finish: async () => {
      await h.runner.settled();
      h.audioPreviews.close();
      h.close();
    },
  };
}

it.each([
  ["research:notes", "failed"],
  ["research:notes", "pending"],
  ["article:body", "failed"],
  ["article:body", "pending"],
] as const)(
  "upgrades legacy %s in %s state on explicit rebuild without rerunning reports",
  async (key, state) => {
    const h = await fixture(key);
    try {
      h.deps.db.prepare("UPDATE revision_work SET state=? WHERE id=?").run(state, h.piece.workId);
      h.deps.db
        .prepare("UPDATE revision_work_pieces SET state=? WHERE id=?")
        .run(state, h.piece.id);
      const reports = h.deps.db
        .prepare("SELECT * FROM revision_pieces WHERE piece_key LIKE 'research:chapter:%'")
        .all();
      const old = h.deps.db
        .prepare("SELECT * FROM revision_work_pieces WHERE id=?")
        .get(h.piece.id);
      const attempts = h.deps.db.prepare("SELECT * FROM attempts").all();
      const rebuilt = await start(h.deps, h.projectId, ["article:body"]);
      expect(rebuilt.preview.warnings).toContain(
        "A previous request was submitted without a saved result or resumable job. Retrying may charge you again.",
      );
      expect(rebuilt.result.value.workIds).not.toContain(h.piece.workId);
      await h.runner.settled();
      expect(h.calls).toEqual(
        key === "research:notes" ? ["research:notes", "article:body"] : ["article:body"],
      );
      expect(
        h.deps.db
          .prepare("SELECT * FROM revision_pieces WHERE piece_key LIKE 'research:chapter:%'")
          .all(),
      ).toEqual(reports);
      expect(
        h.deps.db.prepare("SELECT * FROM revision_work_pieces WHERE id=?").get(h.piece.id),
      ).toEqual(old);
      expect(h.deps.db.prepare("SELECT * FROM attempts").all()).toEqual(
        expect.arrayContaining(attempts),
      );
      expect(
        current(h.deps, h.projectId).outputs.some(
          (row) => row.selected && row.output.role === "article_md" && row.state === "ready",
        ),
      ).toBe(true);
    } finally {
      await h.finish();
    }
  },
);

it.each(["running", "accepted", "cached"])("preserves %s legacy requests", async (mode) => {
  const h = await fixture("research:notes");
  try {
    if (mode === "running")
      h.deps.db.prepare("UPDATE revision_work SET state='running' WHERE id=?").run(h.piece.workId);
    if (mode === "accepted")
      h.deps.db
        .prepare("UPDATE revision_work_pieces SET continuation='accepted-job' WHERE id=?")
        .run(h.piece.id);
    if (mode === "cached")
      h.deps.db
        .prepare("UPDATE revision_work_pieces SET result_json=? WHERE id=?")
        .run(JSON.stringify({ text: "Saved answer", finishReason: "stop" }), h.piece.id);
    const preview = await previewRebuild(h.deps, {
      projectId: h.projectId,
      baseRevisionId: current(h.deps, h.projectId).revision.id,
      request: { kind: "selected", workKeys: ["research:notes"] },
    });
    if (!preview.ok) throw new Error(JSON.stringify(preview));
    expect(preview.value.work.find((row) => row.key === "research:notes")?.fingerprint).toBe(
      h.legacy.fingerprint,
    );
    expect(h.calls).toEqual([]);
  } finally {
    await h.finish();
  }
});
