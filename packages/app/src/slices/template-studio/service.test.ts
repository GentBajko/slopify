import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { attachSamples } from "../../kernel/paths.js";
import { createPrompt } from "../library/save.js";
import { defaultLoudness } from "../loudness/model.js";
import { draftFixture } from "../play-drafts/draft.fake.js";
import { createTemplate, updateTemplate } from "../project-templates/service.js";
import type { ProviderStatus } from "../settings/model.js";
import { writeSetting } from "../settings/repo.js";
import { getAnatomy } from "./anatomy-view.js";
import { createFreeSamples } from "./free.js";
import { makePaidSample } from "./paid.js";
import { sampleOf, sampleProjects } from "./repo.js";
import {
  createPriceCache,
  createReadinessCache,
  getStudio,
  getStudioChecks,
  type StudioDeps,
} from "./service.js";
import { paidDocument, paidSampleDeps } from "./studio.fake.js";

const open: (() => void)[] = [];
afterEach(() => {
  for (const close of open.splice(0)) close();
});

function studio(statuses: readonly ProviderStatus[] = []) {
  const h = draftFixture();
  open.push(h.close);
  const deps: StudioDeps = {
    db: h.deps.db,
    clock: h.deps.clock,
    paths: h.deps.paths,
    log: h.deps.log,
    providerStatuses: async () => statuses,
    free: createFreeSamples({ loudnessDefault: () => defaultLoudness }),
    prices: createPriceCache(),
  };
  const id = randomUUID();
  const created = createTemplate(h.deps, { id, name: "Show", document: h.document });
  if (!created.ok) throw new Error(created.reason);
  return { h, deps, id };
}

describe("getStudio", () => {
  it("refuses a template that doesn't exist, saying where to look", async () => {
    const { deps } = studio();
    expect(await getStudio(deps, randomUUID())).toEqual({
      ok: false,
      reason: "not-found",
      message:
        "This template no longer exists; it may have been deleted. Go to Templates to see your templates.",
    });
  });

  it("shows a new template as unchecked, on the default sample topic, with its sections and checks", async () => {
    const { deps, id } = studio();
    const result = await getStudio(deps, id);
    if (!result.ok) throw new Error(result.message);
    expect(result.value.gate).toBe("unchecked");
    expect(result.value.runnableVersion).toBe(1);
    expect(result.value.gated).toBe(false);
    expect(result.value.checkedVersion).toBeNull();
    expect(result.value.sample).toEqual({
      topic: "The history of the lighthouse",
      topicSource: "fixed",
      fullScript: false,
    });
    expect(result.value.sections.map((section) => [section.id, section.state])).toEqual([
      ["subject", "off"],
      ["script", "stale"],
      ["voice", "needs-fix"],
      ["pictures", "stale"],
      ["video", "needs-fix"],
      ["thumbnail", "off"],
      ["shorts", "off"],
      ["document", "off"],
      ["reviews", "off"],
      ["upload", "stale"],
      ["schedule", "off"],
    ]);
    // This test's Slopify has no ffmpeg: the free samples say how to get it.
    expect(result.value.free.video.sentence).toContain("started without ffmpeg");
    expect(result.value.schedule).toEqual({ runs: [], cost: null });
    expect(result.value.reviews).toEqual([]);
    const checks = await getStudioChecks(deps, id);
    expect(checks.ok && checks.value.checks.find((check) => check.id === "providers")?.ok).toBe(
      false,
    );
  });

  it("answers at once while the providers' readiness is still being looked up", async () => {
    const { deps, id } = studio();
    let asked = 0;
    const slow: StudioDeps = {
      ...deps,
      providerStatuses: () => {
        asked += 1;
        return new Promise(() => undefined);
      },
    };
    const result = await getStudio(slow, id);
    expect(result.ok).toBe(true);
    expect(asked).toBe(0);
  });

  it("refuses the checks of a template that doesn't exist", async () => {
    const { deps } = studio();
    expect(await getStudioChecks(deps, randomUUID())).toMatchObject({
      ok: false,
      reason: "not-found",
    });
  });

  it("reads the legacy gate a template saved before the studio has, and follows its unchecked edit", async () => {
    const { h, deps, id } = studio();
    h.deps.db
      .prepare("INSERT INTO template_gates (template_id,version,state) VALUES (?,1,'legacy')")
      .run(id);
    const saved = updateTemplate(h.deps, {
      id,
      baseVersion: 1,
      mutationId: randomUUID(),
      name: "Show",
      document: h.document,
    });
    expect(saved.ok).toBe(true);
    const result = await getStudio(deps, id);
    if (!result.ok) throw new Error(result.message);
    expect(result.value.template.version).toBe(2);
    expect(result.value.gate).toBe("unchecked");
    expect(result.value.runnableVersion).toBe(2);
    expect(result.value.gated).toBe(false);
    expect(result.value.checkedVersion).toBe(1);
  });

  it("says a stale section's version was made by Slopify itself when its gate was carried", async () => {
    const { h, deps, id } = studio();
    h.deps.db
      .prepare("INSERT INTO template_gates (template_id,version,state) VALUES (?,1,'ready')")
      .run(id);
    updateTemplate(h.deps, {
      id,
      baseVersion: 1,
      mutationId: randomUUID(),
      name: "Show",
      document: h.document,
    });
    h.deps.db
      .prepare(
        "INSERT INTO template_gates (template_id,version,state,carried_from) VALUES (?,2,'carried',1)",
      )
      .run(id);
    const result = await getStudio(deps, id);
    if (!result.ok) throw new Error(result.message);
    expect(result.value.gate).toBe("carried");
    expect(result.value.runnableVersion).toBe(2);
    const script = result.value.sections.find((section) => section.id === "script");
    expect(script?.state).toBe("stale");
    expect(script?.sentence).toMatch(
      /^Slopify made version 2 from version 1 itself \(a retired model switched, or a new name on restore\)\. /u,
    );
  });

  it("uses the sample topic set in Settings, and a template's own once it has one", async () => {
    const { h, deps, id } = studio();
    writeSetting(h.deps.db, "templateStudio.sampleTopic.default", JSON.stringify("Tea clippers"));
    const first = await getStudio(deps, id);
    expect(first.ok && first.value.sample.topic).toBe("Tea clippers");
    h.deps.db
      .prepare(
        "INSERT INTO template_samples (template_id,project_id,topic,topic_source,full_script,created_at) VALUES (?,'p9','Salt roads','queued',1,'a')",
      )
      .run(id);
    const second = await getStudio(deps, id);
    expect(second.ok && second.value.sample).toEqual({
      topic: "Salt roads",
      topicSource: "queued",
      fullScript: true,
    });
  });

  it("falls back to the lighthouse when the Settings topic is blank or unreadable", async () => {
    const { h, deps, id } = studio();
    writeSetting(h.deps.db, "templateStudio.sampleTopic.default", "{not json");
    const result = await getStudio(deps, id);
    expect(result.ok && result.value.sample.topic).toBe("The history of the lighthouse");
  });

  it("passes the providers check once the template's providers are set up", async () => {
    const statuses: readonly ProviderStatus[] = (
      [
        ["openrouter", "llm"],
        ["openai-tts", "tts"],
        ["openai-image", "image"],
      ] as const
    ).map(([id, family]) => ({
      id,
      family,
      displayName: id,
      readiness: { kind: "keyed", hasKey: true },
    }));
    const { h, deps, id } = studio(statuses);
    const document = {
      ...h.document,
      form: {
        ...h.document.form,
        llm: { provider: "openrouter", model: "gpt" },
        audio: { ...h.document.form.audio, provider: "openai-tts", model: "tts", voice: "alloy" },
        images: { provider: "openai-image", model: "img" },
      },
    };
    updateTemplate(h.deps, {
      id,
      baseVersion: 1,
      mutationId: randomUUID(),
      name: "Show",
      document,
    });
    const result = await getStudioChecks(deps, id);
    expect(result.ok && result.value.checks.find((check) => check.id === "providers")?.ok).toBe(
      true,
    );
  });
});

describe("createReadinessCache", () => {
  it("looks the providers up once for every caller in the window, and again after it", async () => {
    let at = 0;
    let loads = 0;
    const cache = createReadinessCache(
      async () => {
        loads += 1;
        return [];
      },
      () => at,
      30_000,
    );
    await Promise.all([cache(), cache(), cache()]);
    expect(loads).toBe(1);
    at = 29_000;
    await cache();
    expect(loads).toBe(1);
    at = 31_000;
    await cache();
    expect(loads).toBe(2);
  });

  it("never keeps a failed lookup: the next caller asks again", async () => {
    let loads = 0;
    const cache = createReadinessCache(
      async () => {
        loads += 1;
        if (loads === 1) throw new Error("probe failed");
        return [];
      },
      () => 0,
      30_000,
    );
    await expect(cache()).rejects.toThrow("probe failed");
    await expect(cache()).resolves.toEqual([]);
    expect(loads).toBe(2);
  });
});

describe("getStudio with a paid sample", () => {
  it("shows the made sample's sections current and names its project for its files", async () => {
    const h = draftFixture();
    open.push(h.close);
    attachSamples(h.deps.paths, sampleProjects(h.deps.db, h.deps.paths.dataDir));
    const { review, paid } = paidSampleDeps(h.deps);
    const id = randomUUID();
    const created = createTemplate(h.deps, { id, name: "Show", document: paidDocument(review) });
    if (!created.ok) throw new Error(created.reason);
    await makePaidSample(
      paid,
      { templateId: id, templateVersion: 1, ackHigh: 5, kind: "save", requestedAt: "a" },
      new AbortController().signal,
    );
    const deps: StudioDeps = {
      db: h.deps.db,
      clock: h.deps.clock,
      paths: h.deps.paths,
      log: h.deps.log,
      providerStatuses: async () => [],
      free: createFreeSamples({ loudnessDefault: () => defaultLoudness }),
      prices: createPriceCache(),
    };
    const result = await getStudio(deps, id);
    if (!result.ok) throw new Error(result.message);
    expect(result.value.paid).toMatchObject({
      projectId: sampleOf(h.deps.db, id)?.projectId,
      state: "done",
      versions: [{ version: 1, state: "done" }],
    });
    const script = result.value.sections.find((section) => section.id === "script");
    expect(script).toMatchObject({ state: "current", sentence: "Made for version 1." });
    // The anatomy reads the prompt the sample actually sent.
    const anatomy = await getAnatomy({ ...h.deps, review }, id, "script", undefined);
    expect(anatomy.ok && anatomy.value.fromSample).toBe(true);
    expect(anatomy.ok && anatomy.value.segments[1]).toEqual({
      origin: "keyword",
      name: "Topic",
      text: "The history of the lighthouse",
    });
  });
});

describe("getAnatomy", () => {
  it("shows the writer's prompt while another section keeps the sample from being made", async () => {
    const h = draftFixture();
    open.push(h.close);
    const { review } = paidSampleDeps(h.deps);
    const document = paidDocument(review);
    const oils = createPrompt(review, { kind: "image", name: "Oils", body: "An oil painting." });
    if (!oils.ok) throw new Error("The image prompt was refused.");
    // A fresh install: images are on and nobody chose who makes them.
    const unchosen = {
      ...document,
      form: {
        ...document.form,
        sources: { ...document.form.sources, images: "generate" as const },
        imagePrompts: [{ name: "Oils", number: "4" }],
      },
    };
    const id = randomUUID();
    const created = createTemplate(h.deps, { id, name: "Show", document: unchosen });
    if (!created.ok) throw new Error(created.reason);
    const anatomy = await getAnatomy({ ...h.deps, review }, id, "script", undefined);
    if (!anatomy.ok) throw new Error(anatomy.message);
    expect(anatomy.value).toMatchObject({ problem: null, item: "article", fromSample: false });
    expect(anatomy.value.segments.map((segment) => segment.text).join("")).toContain(
      "documentary script about",
    );
  });
});
