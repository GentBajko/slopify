import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { fakeImage } from "../src/adapters/fake/image.js";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { providerError } from "../src/kernel/ports/model.js";
import { getRevisionView } from "../src/slices/revisions/view.js";
import { outputPath } from "../src/slices/storage/layout.js";
import { composedFixture, current, deferred, save, start, tone } from "./revision-rebuild.fake.js";

it("lets affected audio settle only in its origin while independent queued images continue", async () => {
  const gate = deferred<void>();
  const entered = deferred<void>();
  const audio = fakeTts({ bytesFor: () => [tone()] });
  const images = fakeImage();
  let delay = false;
  const h = await composedFixture({
    image: () => images,
    tts: () => ({
      ...audio,
      synthesize: async (request) => {
        if (delay) {
          entered.resolve();
          await gate.promise;
        }
        return audio.synthesize(request);
      },
    }),
  });
  try {
    const base = current(h.deps, h.projectId);
    await save(h.deps, h.projectId, {
      config: {
        ...base.revision.config,
        sources: { ...base.revision.config.sources, audio: "generate" },
        audio: { provider: "openai-tts", model: "tts", voice: "first" },
        chunking: { mode: "paragraph" },
        provided: { article: "abcdefgh" },
      },
      content: base.revision.content,
    });
    await start(h.deps, h.projectId, ["export:wav"]);
    await h.runner.settled();
    const completed = current(h.deps, h.projectId);
    const wav = completed.outputs.find((row) => row.output.role === "audio_export" && row.selected);
    if (wav === undefined) throw new Error("Missing prior WAV");
    const originalBytes = readFileSync(outputPath(h.deps.paths, h.projectId, wav.output.path));
    expect(audio.calls()).toBe(2);
    const r1 = await save(h.deps, h.projectId, {
      config: {
        ...completed.revision.config,
        audio: { provider: "openai-tts", model: "tts", voice: "second" },
      },
      content: completed.revision.content,
    });
    delay = true;
    await start(h.deps, h.projectId, ["export:wav", "image:one", "image:two"]);
    await entered.promise;
    await save(h.deps, h.projectId, {
      config: {
        ...r1.revision.config,
        audio: { provider: "openai-tts", model: "tts", voice: "third" },
      },
      content: r1.revision.content,
    });
    gate.resolve();
    await h.runner.settled();
    const latest = current(h.deps, h.projectId);
    const oldParts =
      getRevisionView(h.deps, h.projectId, r1.revision.id)?.pieces.filter(
        (row) =>
          row.stageKind === "audio" &&
          row.available &&
          !completed.pieces.some((old) => old.assetId === row.assetId),
      ) ?? [];
    expect(oldParts).toHaveLength(1);
    expect(latest.pieces.some((row) => row.selected && row.assetId === oldParts[0]?.assetId)).toBe(
      false,
    );
    expect(latest.outputs.find((row) => row.output.id === wav.output.id)).toMatchObject({
      selected: true,
      state: "outdated",
      available: true,
    });
    expect(readFileSync(outputPath(h.deps.paths, h.projectId, wav.output.path))).toEqual(
      originalBytes,
    );
    expect(audio.calls()).toBe(3);
    expect(images.calls()).toBe(2);
    expect(
      latest.outputs.filter(
        (row) => row.output.role === "image" && row.selected && row.state === "ready",
      ),
    ).toHaveLength(2);
  } finally {
    gate.resolve();
    await h.runner.settled();
    h.audioPreviews.close();
    h.close();
  }
}, 30000);

it("retries only a failed narration part and keeps completed physical bytes", async () => {
  const audio = fakeTts({ bytesFor: () => [tone()] });
  let fail = true;
  const calls: string[] = [];
  const h = await composedFixture({
    tts: () => ({
      ...audio,
      synthesize: async (request) => {
        calls.push(request.text);
        if (fail && request.text === "efgh")
          throw providerError({ kind: "refusal", message: "Fixture refusal" });
        return audio.synthesize(request);
      },
    }),
  });
  try {
    const base = current(h.deps, h.projectId);
    await save(h.deps, h.projectId, {
      config: {
        ...base.revision.config,
        sources: { ...base.revision.config.sources, audio: "generate" },
        audio: { provider: "openai-tts", model: "tts", voice: "first" },
        chunking: { mode: "paragraph" },
        provided: { article: "abcdefgh" },
      },
      content: base.revision.content,
    });
    await start(h.deps, h.projectId, ["export:wav"]);
    await h.runner.settled();
    const partial = current(h.deps, h.projectId);
    const finished = partial.pieces.find(
      (row) => row.available && row.selected && row.piece.kind === "chunk",
    );
    if (finished === undefined) throw new Error("Missing completed first part");
    const pieceBefore = h.deps.db
      .prepare("SELECT * FROM project_assets WHERE id=?")
      .get(finished.assetId ?? "");
    expect(calls).toEqual(["abcd", "efgh"]);
    fail = false;
    await start(h.deps, h.projectId, ["export:wav"]);
    await h.runner.settled();
    expect(calls).toEqual(["abcd", "efgh", "efgh"]);
    expect(
      current(h.deps, h.projectId).pieces.find((row) => row.key === finished.key && row.selected)
        ?.assetId,
    ).toBe(finished.assetId);
    expect(
      h.deps.db.prepare("SELECT * FROM project_assets WHERE id=?").get(finished.assetId ?? ""),
    ).toEqual(pieceBefore);
    const completed = current(h.deps, h.projectId);
    await save(h.deps, h.projectId, {
      config: {
        ...completed.revision.config,
        audio: { provider: "openai-tts", model: "tts", voice: "changed" },
      },
      content: completed.revision.content,
    });
    await start(h.deps, h.projectId, ["export:wav"]);
    await h.runner.settled();
    expect(calls).toEqual(["abcd", "efgh", "efgh", "abcd", "efgh"]);
  } finally {
    await h.runner.settled();
    h.audioPreviews.close();
    h.close();
  }
}, 30000);
