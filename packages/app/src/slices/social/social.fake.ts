import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { ensureDirs, layout, type Paths } from "../../kernel/paths.js";
import type { RunConfig } from "../admission/model.js";
import { insertProject } from "../admission/repo.js";
import { outputPath } from "../storage/layout.js";
import type { OutputMeta, OutputRole } from "../storage/model.js";
import { insertOutput } from "../storage/repo.js";

export const baseConfig: RunConfig = {
  title: "Episode one",
  format: "16:9",
  sources: {
    research: "off",
    article: "provide",
    audio: "off",
    images: "off",
    thumbnail: "off",
    video: "off",
  },
  imagePrompts: [],
  values: {},
  provided: { article: "Saved." },
  silenceGapSeconds: 0,
  imageSeconds: 15,
  zoomPercent: 22.5,
  motionStyle: "zoom",
  edgeSilenceSeconds: 0,
  rendered: {},
};

// A migrated in-memory database with projects "p1" (and any others named).
export function socialDb(
  projects: readonly { readonly id: string; readonly config?: Partial<RunConfig> }[] = [
    { id: "p1" },
  ],
): DatabaseSync {
  const db = openDb(":memory:");
  migrate(db, fixedClock("2026-10-18T10:00:00.000Z"));
  for (const project of projects)
    insertProject(db, {
      id: project.id,
      title: project.config?.title ?? baseConfig.title,
      format: "16:9",
      config: { ...baseConfig, ...project.config },
      createdAt: "2026-10-18T09:00:00.000Z",
      updatedAt: "2026-10-18T09:00:00.000Z",
    });
  return db;
}

export interface PackFixture {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly output: (
    role: OutputRole,
    path: string,
    body: string,
    meta?: OutputMeta,
    durationMs?: number | null,
  ) => void;
  readonly close: () => void;
}

// A project "p1" on disk, with outputs written by `output`.
export function packFixture(config: Partial<RunConfig> = {}): PackFixture {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-social-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, fixedClock("2026-10-18T10:00:00.000Z"));
  insertProject(db, {
    id: "p1",
    title: config.title ?? baseConfig.title,
    format: config.format ?? "16:9",
    config: { ...baseConfig, ...config },
    createdAt: "2026-10-18T09:00:00.000Z",
    updatedAt: "2026-10-18T09:00:00.000Z",
  });
  let n = 0;
  return {
    db,
    paths,
    output: (role, path, body, meta = {}, durationMs = null) => {
      const target = outputPath(paths, "p1", path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, body);
      insertOutput(db, {
        id: `o${String(++n)}`,
        projectId: "p1",
        stageKind: "video",
        role,
        path,
        originalFilename: null,
        bytes: Buffer.byteLength(body),
        durationMs,
        meta,
        createdAt: "2026-10-18T09:30:00.000Z",
      });
    },
    close: () => {
      db.close();
      rmSync(paths.dataDir, { recursive: true, force: true });
    },
  };
}
