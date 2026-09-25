import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCatalogueStore } from "../../catalog/store.js";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { ulidIds } from "../../kernel/ids.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import { resolveFont } from "../fonts/index.js";
import type { DraftDeps, DraftResult, DraftReviewDeps, PlayDraftDocument } from "./model.js";
export function must<T>(result: DraftResult<T>): T {
  if (!result.ok)
    throw new Error(
      `Unexpected fixture refusal: ${result.reason} ${JSON.stringify(result.fields)}`,
    );
  return result.value;
}
export function draftFixture(): {
  readonly deps: DraftDeps;
  readonly document: PlayDraftDocument;
  readonly reopen: () => void;
  readonly close: () => void;
} {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-play-draft-")));
  ensureDirs(paths, { mode: 0o700 });
  const clock = fixedClock("2026-09-12T00:00:00.000Z");
  let db = openDb(paths.db);
  migrate(db, clock);
  const document: PlayDraftDocument = {
    schemaVersion: 1,
    section: "content",
    variants: [],
    expectedWords: "1500",
    previewText: "Every story begins with a word.",
    fontUpload: null,
    form: {
      title: "",
      format: "16:9",
      sources: {
        research: "off",
        article: "generate",
        audio: "generate",
        images: "generate",
        thumbnail: "off",
        video: "generate",
      },
      llm: { provider: "", model: "" },
      audio: { provider: "", model: "", voice: "" },
      images: { provider: "", model: "" },
      articlePrompt: "",
      imagePrompts: [],
      thumbnailPrompt: "",
      intro: "",
      outro: "",
      chunking: { mode: "whole", words: "500", characters: "3000" },
      subtitles: {
        mode: "off",
        language: "en",
        fontId: "default",
        fontSize: "48",
        position: "bottom",
      },
      imageSeconds: "15",
      edgeSilenceSeconds: "2",
      values: {},
      provided: { research: "", article: "", audio: null, thumbnail: null, images: [] },
    },
  };
  return {
    get deps(): DraftDeps {
      return { db, paths, clock, ids: ulidIds, uuid: randomUUID, log: { write: () => undefined } };
    },
    document,
    reopen(): void {
      db.close();
      db = openDb(paths.db);
      migrate(db, clock);
    },
    close(): void {
      db.close();
      rmSync(paths.dataDir, { recursive: true, force: true });
    },
  };
}

export function reviewFixture(): Omit<ReturnType<typeof draftFixture>, "deps"> & {
  readonly deps: DraftReviewDeps;
} {
  const h = draftFixture();
  const catalogue = createCatalogueStore({
    dataDir: h.deps.paths.dataDir,
    fetch: async () => {
      throw new Error("Network is forbidden in this fixture");
    },
  });
  const document: PlayDraftDocument = {
    ...h.document,
    form: {
      ...h.document.form,
      title: "Supplied",
      sources: {
        research: "off",
        article: "provide",
        audio: "off",
        images: "off",
        thumbnail: "off",
        video: "off",
      },
      provided: { ...h.document.form.provided, article: "A complete supplied article." },
    },
  };
  return {
    ...h,
    document,
    get deps(): DraftReviewDeps {
      return {
        ...h.deps,
        catalogue,
        resolveFont: (fontId) => resolveFont(h.deps.paths, fontId),
        modelsFor: async (provider, family) =>
          catalogue.models(provider, family).map((model) => ({
            id: model.id,
            name: model.name,
            ...(family === "llm" && "llm" in model
              ? {
                  thinkingModes: Object.keys(
                    model.llm.thinking ?? {},
                  ) as import("../../kernel/ports/llm.js").ThinkingMode[],
                }
              : {}),
          })),
      };
    },
  };
}

export function startFixture(): Omit<ReturnType<typeof reviewFixture>, "deps"> & {
  readonly deps: import("./model.js").DraftStartDeps;
  readonly ticks: string[];
  readonly events: string[];
} {
  const h = reviewFixture();
  const ticks: string[] = [];
  const events: string[] = [];
  const runner: import("../../kernel/runner/index.js").Runner = {
    tick: (id) => {
      ticks.push(id);
    },
    settled: async () => undefined,
    abortProject: async () => undefined,
    abortAll: async () => undefined,
  };
  return {
    ...h,
    ticks,
    events,
    get deps() {
      return {
        ...h.deps,
        runner,
        emit: () => undefined,
        recordStarted: (ids: readonly string[]) => {
          events.push(...ids);
        },
        providers: async () => [],
        modelsFor: h.deps.modelsFor,
      };
    },
  };
}
