import { randomUUID } from "node:crypto";
import ffmpegStatic from "ffmpeg-static";
import { fakeImage } from "../src/adapters/fake/image.js";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { createHub } from "../src/edge/events/hub.js";
import { currentProjectEvent } from "../src/edge/events/visibility.js";
import { createAudioPreviewStore } from "../src/kernel/audio-preview.js";
import { systemClock } from "../src/kernel/clock.js";
import type { Registry } from "../src/kernel/ports/registry.js";
import { wireRunner } from "../src/main.js";
import { narrationCatalogue } from "../src/slices/rebuild/runtime-narration.fake.js";
import { createRebuildDeps, paidServiceFixture } from "../src/slices/rebuild/service.fake.js";
import { previewRebuild, type RebuildDeps, startRebuild } from "../src/slices/rebuild/service.js";
import type { RevisionDeps, RevisionEdit, RevisionView } from "../src/slices/revisions/model.js";
import { saveRevision } from "../src/slices/revisions/mutations.js";
import { currentRevisionId } from "../src/slices/revisions/repo.js";
import { getRevisionView } from "../src/slices/revisions/view.js";
import { insertVoice } from "../src/slices/settings/repo.js";
import { resolveFfmpeg } from "../src/slices/video/ffmpeg.js";

export function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve = (_value: T): void => {
    throw new Error("Promise not initialized");
  };
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

export function tone(): Uint8Array {
  const bytes = Buffer.alloc(44 + 1600);
  bytes.write("RIFF");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24);
  bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(1600, 40);
  return bytes;
}

export async function composedFixture(ports: Partial<Registry> = {}) {
  const h = await paidServiceFixture();
  for (const voice of ["first", "second", "third", "changed"])
    insertVoice(h.deps.db, { id: voice, name: voice, provider: "openai-tts", voiceId: voice });
  const catalogue = {
    ...h.catalogue,
    providers: { ...h.catalogue.providers, "openai-tts": { maxConcurrent: 1 } },
    tts: narrationCatalogue.tts,
  };
  const registry: Registry = {
    image: () => fakeImage(),
    tts: () => fakeTts({ bytesFor: () => [tone()] }),
    llm: () => fakeLlm(),
    list: async () => [],
    ...ports,
  };
  const compose = (base: RevisionDeps) => {
    const service = createRebuildDeps({ ...base, clock: systemClock }, catalogue);
    const audioPreviews = createAudioPreviewStore();
    const hub = createHub({ ...base, acceptEvent: (event) => currentProjectEvent(base.db, event) });
    const runner = wireRunner({
      ...service.deps,
      ffmpeg: resolveFfmpeg({}, ffmpegStatic),
      hub,
      registry,
      audioPreviews,
      telemetry: { ...base, appVersion: "test" },
      flusher: { soon: () => undefined, stop: () => undefined },
    });
    return {
      deps: { ...service.deps, runner },
      runner,
      audioPreviews,
      setCatalogue: service.setCatalogue,
    };
  };
  return { ...h, ...compose(h.deps), compose };
}

export function current(deps: RevisionDeps, projectId: string): RevisionView {
  const id = currentRevisionId(deps.db, projectId);
  const view = id === undefined ? undefined : getRevisionView(deps, projectId, id);
  if (view === undefined) throw new Error("Missing current revision");
  return view;
}

export async function save(
  deps: RevisionDeps,
  projectId: string,
  edit: RevisionEdit,
): Promise<RevisionView> {
  const result = await saveRevision(deps, {
    projectId,
    baseRevisionId: current(deps, projectId).revision.id,
    idempotencyKey: randomUUID(),
    edit,
  });
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.view;
}

export async function start(deps: RebuildDeps, projectId: string, workKeys: readonly string[]) {
  const preview = await previewRebuild(deps, {
    projectId,
    baseRevisionId: current(deps, projectId).revision.id,
    request: { kind: "selected", workKeys },
  });
  if (!preview.ok) throw new Error(JSON.stringify(preview));
  const input = {
    projectId,
    baseRevisionId: preview.value.baseRevisionId,
    previewId: preview.value.id,
    idempotencyKey: randomUUID(),
    acknowledgeUnknownCosts: true,
    confirmedProvidedWorkKeys: preview.value.providedReuseRequired,
  };
  const result = await startRebuild(deps, input);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return { input, result, preview: preview.value };
}
