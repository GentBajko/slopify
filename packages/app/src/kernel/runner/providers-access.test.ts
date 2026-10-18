import { describe, expect, it } from "vitest";
import { manualClock } from "../clock.fake.js";
import type { Log } from "../log.js";
import type { ImagePort } from "../ports/image.js";
import type { LlmPort } from "../ports/llm.js";
import { providerError } from "../ports/model.js";
import type { Registry } from "../ports/registry.js";
import type { TtsPort } from "../ports/tts.js";
import type { AttemptStore } from "./attempt-repo.js";
import { auditionVoice } from "./audition.js";
import type { StageContext } from "./index.js";
import type { AccessUse, ModelAccessRecorder } from "./model-access.js";
import { stageProviders } from "./providers.js";
import { standaloneImage, standaloneLlm } from "./standalone.js";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const attempts: AttemptStore = { start: () => "a", end: () => {} };
const denied = () =>
  providerError({ kind: "unsupported", message: "Not on your plan.", access: "no-access" });

interface Seen {
  readonly worked: AccessUse[];
  readonly denied: (AccessUse & { readonly sentence: string })[];
  readonly logs: string[];
}

function recorder(throws = false): { readonly access: ModelAccessRecorder; readonly seen: Seen } {
  const seen: Seen = { worked: [], denied: [], logs: [] };
  return {
    seen,
    access: {
      worked: (use) => {
        if (throws) throw new Error("db locked");
        seen.worked.push(use);
      },
      denied: (use) => {
        if (throws) throw new Error("db locked");
        seen.denied.push(use);
      },
    },
  };
}

function registry(fail: boolean): Registry {
  const llm: LlmPort = {
    id: "openrouter",
    capabilities: { streams: true, reportsUsage: true, webSearch: false },
    models: () => Promise.resolve([]),
    complete: async function* () {
      if (fail) throw denied();
      yield { type: "delta", text: "OK" };
      yield { type: "done", usage: null, finishReason: "stop" };
    },
  };
  const tts: TtsPort = {
    id: "elevenlabs",
    capabilities: { streams: false },
    models: () => Promise.resolve([]),
    synthesize: () =>
      fail
        ? Promise.reject(denied())
        : Promise.resolve({
            audio: new Response(png).body as ReadableStream<Uint8Array>,
            container: "mp3",
          }),
  };
  const image: ImagePort = {
    id: "fal",
    models: () => Promise.resolve([]),
    generate: () =>
      fail ? Promise.reject(denied()) : Promise.resolve({ bytes: png, mime: "image/png" }),
    animate: () =>
      fail ? Promise.reject(denied()) : Promise.resolve({ bytes: png, mime: "video/mp4" }),
  };
  return { llm: () => llm, tts: () => tts, image: () => image, list: () => Promise.resolve([]) };
}

function context(): StageContext {
  const work = {
    projectId: "p1",
    kind: "article" as const,
    stageId: "s1",
    revisionId: "r1",
    workId: "w1",
    fingerprint: "f",
  };
  return {
    stage: { id: "s1", projectId: "p1", kind: "article", state: "running", work },
    work,
    maySubmit: () => true,
    signal: new AbortController().signal,
    emit: () => {},
  };
}

function providers(fail: boolean, access?: ModelAccessRecorder, logs: string[] = []) {
  const log: Log = {
    write: (_level, event, fields) => logs.push(`${event} ${fields?.detail ?? ""}`),
  };
  return stageProviders(
    {
      registry: registry(fail),
      attempts,
      clock: manualClock(),
      log,
      ...(access === undefined ? {} : { access }),
    },
    context(),
  );
}

const llmCall = {
  provider: "openrouter",
  model: "m1",
  messages: [{ role: "user", content: "Hi" }],
} as const;
const ttsCall = { provider: "elevenlabs", model: "t1", voiceId: "v", text: "Hi" };
const imageCall = { provider: "fal", model: "i1", prompt: "dot", aspect: "1:1" } as const;
const animateCall = {
  ...imageCall,
  model: "v1",
  image: { bytes: png, mime: "image/png" as const },
  seconds: 5,
};

describe("learning from real runs", () => {
  it("marks each model a successful call used as working", async () => {
    const { access, seen } = recorder();
    const p = providers(false, access);
    await p.llm(llmCall);
    await p.tts(ttsCall);
    await p.image(imageCall);
    await p.animate?.(animateCall);
    expect(seen.worked).toEqual([
      { provider: "openrouter", family: "llm", model: "m1" },
      { provider: "elevenlabs", family: "tts", model: "t1" },
      { provider: "fal", family: "image", model: "i1" },
      { provider: "fal", family: "image", model: "v1" },
    ]);
  });

  it("marks a model the provider said is not on the plan, with its sentence, and still fails", async () => {
    const { access, seen } = recorder();
    const p = providers(true, access);
    await expect(p.llm(llmCall)).rejects.toThrow("Not on your plan.");
    await expect(p.tts(ttsCall)).rejects.toThrow("Not on your plan.");
    await expect(p.image(imageCall)).rejects.toThrow("Not on your plan.");
    await expect(p.animate?.(animateCall)).rejects.toThrow("Not on your plan.");
    expect(seen.denied.map((use) => [use.family, use.model, use.sentence])).toEqual([
      ["llm", "m1", "Not on your plan."],
      ["tts", "t1", "Not on your plan."],
      ["image", "i1", "Not on your plan."],
      ["image", "v1", "Not on your plan."],
    ]);
  });

  it("records nothing for a failure that says nothing about the model", async () => {
    const { access, seen } = recorder();
    const reg = registry(false);
    const busy: Registry = {
      ...reg,
      image: () => ({
        ...reg.image("fal"),
        generate: () => Promise.reject(providerError({ kind: "refusal", message: "Flagged." })),
      }),
    };
    const p = stageProviders(
      { registry: busy, attempts, clock: manualClock(), log: { write: () => {} }, access },
      context(),
    );
    await expect(p.image(imageCall)).rejects.toThrow("Flagged.");
    expect(seen).toEqual({ worked: [], denied: [], logs: [] });
  });

  it("logs a recorder that throws and never fails the call", async () => {
    const { access } = recorder(true);
    const logs: string[] = [];
    const ok = providers(false, access, logs);
    await expect(ok.llm(llmCall)).resolves.toMatchObject({ ok: true });
    await expect(providers(true, access, logs).llm(llmCall)).rejects.toThrow("Not on your plan.");
    expect(logs.filter((line) => line.startsWith("model-checks.record"))).toHaveLength(2);
  });

  it("works without a recorder", async () => {
    await expect(providers(false).llm(llmCall)).resolves.toMatchObject({ ok: true });
  });

  it("learns from standalone calls and auditions too", async () => {
    const { access, seen } = recorder();
    const deps = {
      registry: registry(false),
      clock: manualClock(),
      log: { write: () => {} },
      access,
    };
    const use = { owner: { kind: "schedule", id: "s" }, purpose: "topics" } as const;
    await standaloneLlm(deps, { ...llmCall, ...use });
    await standaloneImage(deps, { ...imageCall, ...use });
    await auditionVoice(deps, ttsCall, new AbortController().signal);
    const failing = { ...deps, registry: registry(true) };
    await expect(standaloneLlm(failing, { ...llmCall, ...use })).rejects.toThrow();
    await expect(standaloneImage(failing, { ...imageCall, ...use })).rejects.toThrow();
    await expect(auditionVoice(failing, ttsCall, new AbortController().signal)).rejects.toThrow();
    expect(seen.worked.map((u) => u.family)).toEqual(["llm", "image", "tts"]);
    expect(seen.denied.map((u) => u.family)).toEqual(["llm", "image", "tts"]);
  });
});
