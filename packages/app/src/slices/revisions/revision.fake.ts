import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { RunConfig } from "../admission/model.js";
import { insertProject } from "../admission/repo.js";
import type { RevisionDeps } from "./model.js";

const config: RunConfig = {
  title: "Saved",
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
  provided: { article: "Saved article." },
  silenceGapSeconds: 0,
  rendered: {},
};
export function revisionFixture(): {
  readonly deps: RevisionDeps;
  readonly config: RunConfig;
  readonly projectId: string;
  readonly close: () => void;
} {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-revision-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(":memory:");
  const clock = fixedClock("2026-09-10T00:00:00.000Z");
  migrate(db, clock);
  let next = 0;
  const deps: RevisionDeps = {
    db,
    paths,
    clock,
    ids: { next: () => `r${++next}` },
    log: { write: () => undefined },
  };
  const projectId = "p1";
  insertProject(db, {
    id: projectId,
    title: config.title,
    format: config.format,
    config,
    createdAt: clock.now().toISOString(),
    updatedAt: clock.now().toISOString(),
  });
  mkdirSync(join(paths.projects, projectId), { recursive: true });
  return {
    deps,
    config,
    projectId,
    close: () => {
      db.close();
      rmSync(paths.dataDir, { recursive: true, force: true });
    },
  };
}
