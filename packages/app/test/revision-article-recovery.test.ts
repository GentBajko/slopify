import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import { openDb } from "../src/kernel/db/index.js";
import { recoverWork } from "../src/slices/rebuild/repo.js";
import { executionPlan } from "../src/slices/rebuild/runtime-plan.js";
import { workPieces } from "../src/slices/rebuild/work-records.js";
import { findRevisionDownload } from "../src/slices/revisions/downloads.js";
import { revisionViewSchema } from "../src/slices/revisions/schema.js";
import { getRevisionView } from "../src/slices/revisions/view.js";
import { composedFixture, current, deferred, save, start } from "./revision-rebuild.fake.js";

async function configureArticle(h: Awaited<ReturnType<typeof composedFixture>>) {
  const catalogue = {
    ...h.deps.catalogue.read(),
    providers: { ...h.deps.catalogue.read().providers, openrouter: { maxConcurrent: 1 } },
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
  h.setCatalogue(catalogue);
  const base = current(h.deps, h.projectId);
  const view = await save(h.deps, h.projectId, {
    config: {
      ...base.revision.config,
      sources: { ...base.revision.config.sources, article: "generate", images: "off" },
      llm: { provider: "openrouter", model: "text" },
      provided: {},
      rendered: { article: "Write" },
    },
    content: {
      ...base.revision.content,
      articleEdited: false,
      imageOrder: [],
      imageDefinitions: {},
    },
  });
  return { catalogue, view };
}

it.each(["same revision", "title edit", "article edit"] as const)(
  "resumes only authorized article continuations after reopening: %s",
  async (edit) => {
    const gate = deferred<void>();
    const entered = deferred<void>();
    const first = fakeLlm({ deltas: ["First "], finishReason: "length" });
    const last = fakeLlm({ deltas: ["last."] });
    let hold = true;
    const h = await composedFixture({
      llm: () => ({
        ...first,
        complete: async function* (request) {
          if (request.messages.length === 1) {
            yield* first.complete(request);
            return;
          }
          if (hold) {
            entered.resolve();
            await gate.promise;
          }
          yield* last.complete(request);
        },
      }),
    });
    let closed = false;
    let reopened: ReturnType<typeof openDb> | undefined;
    try {
      const { catalogue, view } = await configureArticle(h);
      await start(h.deps, h.projectId, ["article:body"]);
      await entered.promise;
      const workId = h.deps.db
        .prepare(
          "SELECT id FROM revision_work WHERE revision_id=? AND kind='article' AND state='running'",
        )
        .get(view.revision.id)?.id;
      if (typeof workId !== "string") throw new Error("Missing article invocation");
      expect(workPieces(h.deps.db, workId).map((piece) => piece.key)).toEqual([
        "article:body",
        "article:continuation:1",
      ]);
      const snapshot = join(h.deps.paths.dataDir, "article-interrupted.sqlite");
      h.deps.db.prepare("VACUUM INTO ?").run(snapshot);
      gate.resolve();
      await h.runner.settled();
      h.deps.db.close();
      closed = true;
      reopened = openDb(snapshot);
      recoverWork(reopened);
      const next = h.compose({ ...h.deps, db: reopened });
      next.setCatalogue(catalogue);
      try {
        next.runner.tick(h.projectId);
        await next.runner.settled();
        expect(first.calls()).toBe(1);
        expect(last.calls()).toBe(1);
        const partials = getRevisionView(next.deps, h.projectId, view.revision.id)?.outputs.filter(
          (row) => row.workKey.startsWith("article:partial:"),
        );
        expect(partials).toHaveLength(1);
        if (edit !== "same revision") {
          const head = current(next.deps, h.projectId);
          await save(next.deps, h.projectId, {
            config: {
              ...head.revision.config,
              ...(edit === "title edit"
                ? { title: "New title" }
                : { rendered: { article: "Changed prompt" } }),
            },
            content: head.revision.content,
          });
        }
        hold = false;
        await start(next.deps, h.projectId, ["article:body"]);
        await next.runner.settled();
        expect(current(next.deps, h.projectId).articleMarkdown).toBe("First last.");
        expect(first.calls()).toBe(edit === "article edit" ? 2 : 1);
        expect(last.calls()).toBe(2);
        expect(
          getRevisionView(next.deps, h.projectId, view.revision.id)?.outputs.filter((row) =>
            row.workKey.startsWith("article:partial:"),
          ),
        ).toEqual(partials);
        expect(
          workPieces(reopened, workId).every((piece) =>
            edit === "article edit"
              ? piece.dispatchState !== "allowed" && piece.state === "held"
              : piece.state === "done",
          ),
        ).toBe(true);
        expect(
          reopened
            .prepare("SELECT outcome FROM attempts WHERE work_id=? ORDER BY rowid")
            .all(workId),
        ).toEqual(
          edit === "article edit"
            ? [{ outcome: "ok" }, { outcome: null }]
            : [{ outcome: "ok" }, { outcome: null }, { outcome: "ok" }],
        );
      } finally {
        await next.runner.settled();
        next.audioPreviews.close();
      }
    } finally {
      gate.resolve();
      h.audioPreviews.close();
      reopened?.close();
      if (closed) rmSync(h.deps.paths.dataDir, { recursive: true, force: true });
      else {
        await h.runner.settled();
        h.close();
      }
    }
  },
);

it("retains an accepted partial article as an origin download without completing or publishing over the edited head", async () => {
  const gate = deferred<void>();
  const entered = deferred<void>();
  const llm = fakeLlm({ deltas: ["Accepted partial article"], finishReason: "length" });
  const h = await composedFixture({
    llm: () => ({
      ...llm,
      complete: async function* (request) {
        entered.resolve();
        await gate.promise;
        yield* llm.complete(request);
      },
    }),
  });
  try {
    const { catalogue, view } = await configureArticle(h);
    await start(h.deps, h.projectId, ["article:body"]);
    await entered.promise;
    const edited = await save(h.deps, h.projectId, {
      config: { ...view.revision.config, rendered: { article: "Changed prompt" } },
      content: view.revision.content,
    });
    gate.resolve();
    await h.runner.settled();
    const origin = getRevisionView(h.deps, h.projectId, view.revision.id);
    const partial = origin?.outputs.find(
      (row) => row.output.role === "article_md" && !row.selected,
    );
    expect(partial).toMatchObject({ available: true, selected: false, state: "outdated" });
    if (partial === undefined) throw new Error("Missing retained partial article");
    const download = findRevisionDownload(h.deps, h.projectId, view.revision.id, partial.recordId);
    if (!download.ok) throw new Error(JSON.stringify(download));
    expect(readFileSync(download.download.path, "utf8")).toBe("Accepted partial article");
    expect(current(h.deps, h.projectId).revision.id).toBe(edited.revision.id);
    expect(current(h.deps, h.projectId).articleMarkdown).toBe(edited.articleMarkdown);
    expect(
      current(h.deps, h.projectId).outputs.some((row) => row.assetId === partial.assetId),
    ).toBe(false);
    if (origin === undefined) throw new Error("Missing origin");
    expect(revisionViewSchema.safeParse(origin).success).toBe(true);
    expect(
      executionPlan(h.deps, origin, catalogue).work.find((row) => row.key === "article:body")
        ?.disposition,
    ).not.toBe("reuse");
    recoverWork(h.deps.db);
    expect(
      getRevisionView(h.deps, h.projectId, view.revision.id)?.outputs.find(
        (row) => row.recordId === partial.recordId,
      )?.available,
    ).toBe(true);
    expect(llm.calls()).toBe(1);
  } finally {
    gate.resolve();
    await h.runner.settled();
    h.audioPreviews.close();
    h.close();
  }
});
