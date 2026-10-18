import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { type AudioPreviewStore, createAudioPreviewStore } from "../../kernel/audio-preview.js";
import { outputPath } from "../storage/layout.js";
import { narrationCatalogue, narrationFixture } from "./runtime-narration.fake.js";

// The body narration over the revision runtime and the real bundled ffmpeg: one request per
// part, joined in order, measured and labelled. Each fixture part is a tenth of a second.

function bodyOf(h: Awaited<ReturnType<typeof narrationFixture>>) {
  const row = h.view().outputs.find((one) => one.selected && one.output.role === "audio_body");
  if (row === undefined) throw new Error("The body narration was not joined.");
  return row;
}

it("narrates every part, joins them in order and stores the measured sum", async () => {
  const h = await narrationFixture("abcdefgh");
  try {
    await h.pump();
    expect(h.calls.filter((call) => call.kind === "tts").map((call) => call.text)).toEqual([
      "abcd",
      "efgh",
    ]);
    const body = bodyOf(h);
    expect(body.state).toBe("ready");
    expect(body.output.durationMs).toBeGreaterThanOrEqual(140);
    expect(body.output.durationMs).toBeLessThanOrEqual(260);
    expect(body.output.meta).toMatchObject({
      provider: "openai-tts",
      model: "tts",
      voice: "voice",
    });
  } finally {
    h.close();
  }
}, 30_000);

it("sends the whole text as one request and copies its audio rather than re-encoding", async () => {
  const h = await narrationFixture("abcd", { config: { chunking: { mode: "whole" } } });
  try {
    await h.pump();
    expect(h.calls.filter((call) => call.kind === "tts").map((call) => call.text)).toEqual([
      "abcd",
    ]);
    const part = h.view().pieces.find((row) => row.selected && row.piece.kind === "chunk");
    const asset = h.deps.db
      .prepare("SELECT path FROM project_assets WHERE id=?")
      .get(part?.assetId ?? "");
    if (asset === undefined) throw new Error("The narration part has no stored audio.");
    expect(readFileSync(outputPath(h.deps.paths, h.projectId, bodyOf(h).output.path))).toEqual(
      readFileSync(outputPath(h.deps.paths, h.projectId, String(asset.path))),
    );
  } finally {
    h.close();
  }
}, 30_000);

it("previews each part, the intro and the outro under their own names", async () => {
  const store = createAudioPreviewStore();
  // The join clears the previews it replaces, so each one is read as it ends.
  const previewed: { label: string; bytes: number; state: string }[] = [];
  const audioPreviews: AudioPreviewStore = {
    ...store,
    begin: (projectId, key, label, origin) => {
      const sink = store.begin(projectId, key, label, origin);
      return {
        ...sink,
        complete: () => {
          sink.complete();
          const row = store.list(projectId).find((one) => one.label === label);
          previewed.push({ label, bytes: row?.bytes ?? 0, state: row?.state ?? "missing" });
        },
      };
    },
  };
  const h = await narrationFixture("abcdefgh", {
    audioPreviews,
    config: {
      intro: { name: "Greeting", mode: "text" },
      outro: { name: "Ending", mode: "text" },
      rendered: { intro: "Hi.", outro: "Bye." },
    },
    catalogue: narrationCatalogue,
  });
  try {
    await h.pump();
    expect(previewed.map((row) => row.label).sort()).toEqual([
      "Body part 1 of 2",
      "Body part 2 of 2",
      "Intro",
      "Outro",
    ]);
    for (const row of previewed) {
      expect(row.state).toBe("ready");
      expect(row.bytes).toBeGreaterThan(0);
    }
  } finally {
    store.close();
    h.close();
  }
}, 30_000);
