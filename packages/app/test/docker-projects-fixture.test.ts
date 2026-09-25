import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { retainedOutput, retainedPiece } from "../src/slices/revisions/downloads.fake.js";
import { mutationFixture } from "../src/slices/revisions/mutation.fake.js";
import { saveRevision } from "../src/slices/revisions/mutations.js";

it("seeds retained IDs, research, partial audio and failed/paused state without attempts", async () => {
  const supplied = process.env.SLOPIFY_DOCKER_FIXTURE_OUT;
  const out = supplied
    ? resolve(supplied)
    : await mkdtemp(join(tmpdir(), "slopify-docker-projects-fixture-"));
  if (!out.startsWith(join(tmpdir(), "slopify-docker-projects-")))
    throw new Error("Fixture output must belong to the disposable Docker smoke.");
  const h = await mutationFixture();
  try {
    await mkdir(out, { recursive: true, mode: 0o700 });
    const old = retainedOutput(
      h.deps,
      h.base.revision,
      "audio_export",
      "old.wav",
      "retained audio bytes",
    );
    const research = retainedOutput(
      h.deps,
      h.base.revision,
      "sources",
      "research.md",
      "Original research ç🌊",
    );
    const partial = retainedPiece(h.deps, h.base.revision, "partial narration bytes");
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      idempotencyKey: "docker-fixture-save",
      edit: { config: { ...h.config, title: "Current title" }, content: h.base.revision.content },
    });
    expect(saved.ok).toBe(true);
    expect(
      h.deps.db
        .prepare(
          "UPDATE stages SET state='failed',failure_reason='fixture stopped' WHERE project_id=? AND kind='article'",
        )
        .run(h.projectId).changes,
    ).toBe(1);
    h.deps.db
      .prepare(
        "INSERT INTO project_controls(project_id,paused) VALUES (?,1) ON CONFLICT(project_id) DO UPDATE SET paused=1",
      )
      .run(h.projectId);
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()?.n).toBe(0);
    const files = [
      { revision: h.base.revision.id, record: old.recordId, body: "retained audio bytes" },
      { revision: h.base.revision.id, record: research.recordId, body: "Original research ç🌊" },
      { revision: h.base.revision.id, record: partial.recordId, body: "partial narration bytes" },
    ];
    await cp(h.deps.paths.projects, join(out, "projects"), { recursive: true });
    h.deps.db.prepare("VACUUM INTO ?").run(join(out, "slopify.db"));
    await writeFile(join(out, "expected.json"), JSON.stringify({ project: h.projectId, files }), {
      mode: 0o600,
    });
  } finally {
    h.close();
    if (!supplied) await rm(out, { recursive: true, force: true });
  }
});
