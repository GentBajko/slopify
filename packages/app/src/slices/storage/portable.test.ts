import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { draftFixture } from "../play-drafts/draft.fake.js";
import { createTemplate } from "../project-templates/service.js";
import { writeSetting } from "../settings/repo.js";
import { projectDir, stagingPath } from "./layout.js";
import { exportPortable, importPortable, storageUsage } from "./portable.js";
import { insertStagedFile } from "./repo.js";

it("exports settings, templates and staged bytes without provider keys", () => {
  const source = draftFixture();
  const target = draftFixture();
  try {
    const templateId = randomUUID();
    expect(
      createTemplate(source.deps, { id: templateId, name: "Portable", document: source.document })
        .ok,
    ).toBe(true);
    writeSetting(source.deps.db, "silenceGapSeconds", "3");
    const stagedId = "staged-portable";
    writeFileSync(stagingPath(source.deps.paths, stagedId), Buffer.from("audio"), { mode: 0o600 });
    insertStagedFile(source.deps.db, {
      id: stagedId,
      stageKind: "audio",
      path: stagedId,
      originalFilename: "voice.wav",
      bytes: 5,
      state: "staged",
      createdAt: source.deps.clock.now().toISOString(),
    });
    source.deps.db
      .prepare("INSERT INTO provider_keys(provider,key,updated_at) VALUES(?,?,?)")
      .run("openrouter", "secret", source.deps.clock.now().toISOString());
    const archive = exportPortable({
      db: source.deps.db,
      paths: source.deps.paths,
      ids: source.deps.ids,
      now: () => source.deps.clock.now().toISOString(),
    });
    const result = importPortable(
      {
        db: target.deps.db,
        paths: target.deps.paths,
        ids: target.deps.ids,
        now: () => target.deps.clock.now().toISOString(),
      },
      archive,
    );
    expect(result.templates).toBe(1);
    expect(result.stagedFiles).toBe(1);
    expect(
      target.deps.db.prepare("SELECT key FROM settings WHERE key=?").get("silenceGapSeconds"),
    ).toEqual({ key: "silenceGapSeconds" });
    expect(target.deps.db.prepare("SELECT count(*) AS n FROM provider_keys").get()).toEqual({
      n: 0,
    });
  } finally {
    source.close();
    target.close();
  }
});

it("reports project folder usage alongside aggregate storage totals", () => {
  const h = draftFixture();
  try {
    h.deps.db
      .prepare("INSERT INTO projects VALUES (?, ?, '16:9', '{}', ?, ?)")
      .run("p1", "Storage sample", "2026-09-12", "2026-09-12");
    mkdirSync(projectDir(h.deps.paths, "p1"), { recursive: true });
    writeFileSync(`${projectDir(h.deps.paths, "p1")}/video.mp4`, Buffer.alloc(7));
    expect(storageUsage(h.deps).byProject).toEqual([
      { id: "p1", title: "Storage sample", bytes: 7 },
    ]);
  } finally {
    h.close();
  }
});
