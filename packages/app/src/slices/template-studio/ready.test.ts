import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { draftFixture } from "../play-drafts/draft.fake.js";
import type { PlayDraftDocument } from "../play-drafts/schema.js";
import { createTemplate, updateTemplate } from "../project-templates/service.js";
import type { ProviderStatus } from "../settings/model.js";
import { insertVoice } from "../settings/repo.js";
import type { FreeSamples, FreeSamplesView } from "./free.js";
import { gateOf } from "./gate.js";
import { markReady, readyProblems } from "./ready.js";
import { gatesOf, setSampleVersion } from "./repo.js";
import { createPriceCache, type StudioDeps } from "./service.js";

const open: (() => void)[] = [];
afterEach(() => {
  for (const close of open.splice(0)) close();
});

const made = { state: "current" as const, sentence: "Made.", url: null };
const allMade: FreeSamplesView = {
  video: made,
  loudness: {
    ...made,
    beforeUrl: null,
    beforeLufs: null,
    afterLufs: null,
    targetLufs: null,
    ceiling: null,
  },
  document: made,
};

function freeOf(view: FreeSamplesView): FreeSamples {
  return {
    make: async () => undefined,
    view: () => view,
    loudnessHashOf: () => undefined,
    documentHashOf: () => "h",
  };
}

const keyed = (id: string, family: ProviderStatus["family"]): ProviderStatus => ({
  id: id as ProviderStatus["id"],
  family,
  displayName: id,
  readiness: { kind: "keyed", hasKey: true },
});

function setup(options: { readonly free?: FreeSamplesView; readonly ready?: boolean } = {}) {
  const h = draftFixture();
  open.push(h.close);
  const document: PlayDraftDocument = {
    ...h.document,
    form: {
      ...h.document.form,
      llm: { provider: "openrouter", model: "gpt" },
      audio: { ...h.document.form.audio, provider: "openai-tts", model: "tts", voice: "alloy" },
      images: { provider: "openai-image", model: "img" },
    },
  };
  const statuses =
    options.ready === false
      ? []
      : [keyed("openrouter", "llm"), keyed("openai-tts", "tts"), keyed("openai-image", "image")];
  const deps: StudioDeps = {
    db: h.deps.db,
    clock: h.deps.clock,
    paths: h.deps.paths,
    log: h.deps.log,
    providerStatuses: async () => statuses,
    free: freeOf(options.free ?? allMade),
    prices: createPriceCache(),
  };
  // The voice Play's list offers: one saved in Settings → Voices.
  insertVoice(h.deps.db, {
    id: "voice-1",
    provider: "openai-tts",
    name: "Alloy",
    voiceId: "alloy",
  });
  const id = randomUUID();
  const created = createTemplate(h.deps, { id, name: "Show", document });
  if (!created.ok) throw new Error(created.reason);
  const sampled = (version: number) =>
    setSampleVersion(h.deps.db, id, version, { state: "done", at: "2026-09-12T00:00:00.000Z" });
  const edit = (baseVersion: number) => {
    const saved = updateTemplate(h.deps, {
      id,
      baseVersion,
      mutationId: randomUUID(),
      name: "Show",
      document: { ...document, form: { ...document.form, title: `Take ${String(baseVersion)}` } },
    });
    if (!saved.ok) throw new Error(saved.reason);
    return saved.value.version;
  };
  return { h, deps, id, sampled, edit };
}

describe("markReady", () => {
  it("marks the newest version ready once every check passes and every sample is current", async () => {
    const { h, deps, id, sampled } = setup();
    sampled(1);
    const result = await markReady(deps, id, { version: 1 });
    expect(result).toEqual({ ok: true, value: { version: 1, gate: "ready", replayed: false } });
    expect(gateOf(gatesOf(h.deps.db, id), 1)).toBe("ready");
    const row = h.deps.db
      .prepare(
        "SELECT checks_json AS checks, marked_at AS at FROM template_gates WHERE template_id=?",
      )
      .get(id) as { checks: string; at: string };
    expect(JSON.parse(row.checks)).toHaveLength(6);
    expect(row.at).toBe(h.deps.clock.now().toISOString());
  });

  it("answers the same for a version already marked ready, and checks nothing again", async () => {
    const { deps, id, sampled } = setup();
    sampled(1);
    await markReady(deps, id, { version: 1 });
    let asked = 0;
    const counting: StudioDeps = {
      ...deps,
      providerStatuses: async () => {
        asked += 1;
        return [];
      },
    };
    expect(await markReady(counting, id, { version: 1 })).toEqual({
      ok: true,
      value: { version: 1, gate: "ready", replayed: true },
    });
    expect(asked).toBe(0);
  });

  it("refuses with each failing check and the fix it names, marking nothing", async () => {
    const { h, deps, id, sampled } = setup({ ready: false });
    sampled(1);
    const result = await markReady(deps, id, { version: 1 });
    if (result.ok) throw new Error("marked");
    expect(result.reason).toBe("not-ready");
    expect(result.message).toMatch(/^Version 1 can't be approved for schedules yet\. /u);
    expect(result.message).toContain("Settings → Keys & services");
    expect(result.problems.some((problem) => problem.fix !== undefined)).toBe(true);
    expect(gatesOf(h.deps.db, id)).toEqual([]);
  });

  it("refuses while a section's sample isn't current, naming the section", async () => {
    const { deps, id } = setup({
      free: {
        ...allMade,
        video: { state: "needs-fix", sentence: "The video sample failed: no ffmpeg.", url: null },
      },
    });
    const result = await markReady(deps, id, { version: 1 });
    if (result.ok) throw new Error("marked");
    expect(result.problems.map((problem) => problem.label)).toEqual(
      expect.arrayContaining(["Video & captions", "Article"]),
    );
    expect(result.message).toContain("Video & captions: The video sample failed: no ffmpeg.");
  });

  it("marks only the newest version, saying which one to look at", async () => {
    const { deps, id, sampled, edit } = setup();
    sampled(1);
    edit(1);
    expect(await markReady(deps, id, { version: 1 })).toEqual({
      ok: false,
      reason: "conflict",
      message:
        "Version 1 is no longer the newest: the template is at version 2. Look over version 2's samples, then approve it for schedules.",
      problems: [],
    });
  });

  it("refuses a template that doesn't exist", async () => {
    const { deps } = setup();
    expect(await markReady(deps, randomUUID(), { version: 1 })).toMatchObject({
      ok: false,
      reason: "not-found",
    });
  });

  it("turns a carried or legacy version into a ready one", async () => {
    const { h, deps, id, sampled } = setup();
    h.deps.db
      .prepare("INSERT INTO template_gates (template_id,version,state) VALUES (?,1,'legacy')")
      .run(id);
    sampled(1);
    expect((await markReady(deps, id, { version: 1 })).ok).toBe(true);
    expect(gatesOf(h.deps.db, id)).toEqual([{ version: 1, state: "ready", carriedFrom: null }]);
  });
});

describe("readyProblems", () => {
  it("lists failing checks first, then sections that aren't current, off or provided", () => {
    expect(
      readyProblems(
        [
          { id: "keywords", ok: true, sentence: "Filled." },
          {
            id: "providers",
            ok: false,
            sentence: "Set up OpenAI.",
            fix: { label: "Providers", href: "/settings?section=providers" },
          },
        ],
        [
          { id: "script", label: "Script", state: "current", sentence: "Made." },
          { id: "voice", label: "Voice", state: "stale", sentence: "Press Make sample." },
          { id: "shorts", label: "Shorts", state: "off", sentence: "Off." },
          { id: "pictures", label: "Pictures", state: "provided", sentence: "Provided." },
          { id: "video", label: "Video & captions", state: "making", sentence: "Making." },
        ],
      ),
    ).toEqual([
      {
        label: "Services",
        sentence: "Set up OpenAI.",
        fix: { label: "Providers", href: "/settings?section=providers" },
      },
      { label: "Voice", sentence: "Press Make sample.", section: "voice" },
      { label: "Video & captions", sentence: "Making.", section: "video" },
    ]);
  });
});
