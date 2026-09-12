import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { ulidIds } from "../../kernel/ids.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { DraftDeps, DraftResult, PlayDraftDocument } from "./model.js";
export function must<T>(result: DraftResult<T>): T {
  if (!result.ok) throw new Error(`Unexpected fixture refusal: ${result.reason}`);
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
