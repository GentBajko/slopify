import type { DatabaseSync } from "node:sqlite";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { RunConfig } from "../admission/model.js";
import { insertProject } from "../admission/repo.js";

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
