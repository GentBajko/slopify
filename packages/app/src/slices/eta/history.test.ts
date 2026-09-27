import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { StageKind } from "../../kernel/pipeline.js";
import type { Stage } from "../admission/model.js";
import { stagesOf } from "../admission/repo.js";
import { median, readStageHistory } from "./history.js";
import { stagesWithEta } from "./view.js";

const codex = { images: { provider: "codex", model: "gpt-image" } };
const api = { images: { provider: "openai", model: "gpt-image-1" } };

function database(): DatabaseSync {
  const clock = fixedClock("2026-09-27T12:00:00.000Z");
  const db = openDb(join(mkdtempSync(join(tmpdir(), "slopify-eta-")), "test.db"));
  migrate(db, clock);
  return db;
}

let count = 0;
function finished(
  db: DatabaseSync,
  kind: StageKind,
  seconds: number,
  config: object,
  units: number | null = null,
  state = "done",
): string {
  count += 1;
  const id = `p${String(count)}`;
  db.prepare("INSERT INTO projects VALUES (?, 'Run', '16:9', ?, 'x', 'x')").run(
    id,
    JSON.stringify(config),
  );
  const start = Date.parse("2026-09-20T10:00:00.000Z");
  db.prepare(
    "INSERT INTO stages (id, project_id, kind, source, state, progress_current, progress_total, started_at, finished_at) VALUES (?, ?, ?, 'generate', ?, ?, ?, ?, ?)",
  ).run(
    `${id}-${kind}`,
    id,
    kind,
    state,
    units,
    units,
    new Date(start).toISOString(),
    new Date(start + seconds * 1000).toISOString(),
  );
  return id;
}

describe("readStageHistory", () => {
  it("takes the median of the same step on the same provider and model", () => {
    const db = database();
    finished(db, "thumbnail", 240, codex);
    finished(db, "thumbnail", 300, codex);
    finished(db, "thumbnail", 900, codex);
    finished(db, "thumbnail", 5, api);
    finished(db, "thumbnail", 1000, codex, null, "failed");
    const history = readStageHistory(db);
    expect(history.typicalSeconds("thumbnail", codex, null)).toBe(300);
  });

  it("falls back to every step of that kind while a model has too little history", () => {
    const db = database();
    finished(db, "thumbnail", 10, api);
    finished(db, "thumbnail", 30, api);
    finished(db, "thumbnail", 600, codex);
    expect(readStageHistory(db).typicalSeconds("thumbnail", codex, null)).toBe(30);
  });

  it("scales a counted step by how many pieces this one has", () => {
    const db = database();
    // 60 s per image, then 90 s per image.
    finished(db, "images", 240, codex, 4);
    finished(db, "images", 720, codex, 8);
    expect(readStageHistory(db).typicalSeconds("images", codex, 10)).toBe(750);
  });

  it("knows nothing of a step never finished before", () => {
    expect(readStageHistory(database()).typicalSeconds("video", {}, null)).toBeUndefined();
  });
});

describe("stagesWithEta", () => {
  it("adds the time left to a running CLI image job from past runs", () => {
    const db = database();
    finished(db, "thumbnail", 300, codex);
    finished(db, "thumbnail", 300, codex);
    const id = finished(db, "thumbnail", 0, codex);
    db.prepare(
      "UPDATE stages SET state='running', progress_current=0, progress_total=1, started_at=?, finished_at=NULL WHERE project_id=?",
    ).run("2026-09-27T11:59:00.000Z", id);
    const [stage] = stagesWithEta(
      db,
      stagesOf(db, id),
      codex,
      new Date("2026-09-27T12:00:00.000Z"),
    );
    expect(stage).toMatchObject({ etaBasis: "history", etaSeconds: 240, typicalSeconds: 300 });
  });

  it("says unknown honestly, and leaves finished steps alone", () => {
    const db = database();
    const id = finished(db, "video", 0, {});
    db.prepare(
      "UPDATE stages SET state='running', started_at=?, finished_at=NULL WHERE project_id=?",
    ).run("2026-09-27T11:59:00.000Z", id);
    const done: Stage = { ...(stagesOf(db, id)[0] as Stage), kind: "article", state: "done" };
    const [running, finishedStage] = stagesWithEta(
      db,
      [...stagesOf(db, id), done],
      {},
      new Date("2026-09-27T12:00:00.000Z"),
    );
    expect(running).toMatchObject({ etaBasis: "unknown" });
    expect(running).not.toHaveProperty("etaSeconds");
    expect(finishedStage).not.toHaveProperty("etaBasis");
  });
});

describe("median", () => {
  it("takes the middle, or the mean of the two middles", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});
