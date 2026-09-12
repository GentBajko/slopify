import { expect, it } from "vitest";
import { revisionFixture } from "../revisions/revision.fake.js";
import { insertOutput, outputsOf } from "../storage/repo.js";
import { audioInputs } from "./audio-inputs.js";

it("a late probe returns its local duration without rewriting output metadata", async () => {
  const h = revisionFixture();
  try {
    const output = {
      id: "audio",
      projectId: h.projectId,
      stageKind: "audio" as const,
      role: "audio_body" as const,
      path: "old.mp3",
      originalFilename: null,
      bytes: 1,
      durationMs: null,
      meta: {},
      createdAt: h.deps.clock.now().toISOString(),
    };
    insertOutput(h.deps.db, output);
    let release = (_duration: number): void => {};
    const measured = new Promise<number>((resolve) => {
      release = resolve;
    });
    const pending = audioInputs(
      { ...h.deps, ffmpeg: "unused", count: () => {}, measureAudio: () => measured },
      h.projectId,
      [output],
      new AbortController().signal,
    );
    h.deps.db
      .prepare("UPDATE outputs SET path=?,duration_ms=? WHERE id=?")
      .run("new.mp3", 5000, output.id);
    release(1500);
    expect((await pending).body.seconds).toBe(1.5);
    expect(outputsOf(h.deps.db, h.projectId)[0]).toMatchObject({
      path: "new.mp3",
      durationMs: 5000,
    });
    expect(output.durationMs).toBeNull();
  } finally {
    h.close();
  }
});
