import { afterEach, describe, expect, it } from "vitest";
import { catalogueSchema } from "../../catalog/schema.js";
import type { GeneratedImage } from "../../kernel/ports/image.js";
import { designCatalogue, designHarness, type Harness, pngOf } from "./designs.fake.js";
import { poster } from "./document.fake.js";
import type { DesignEvent } from "./model.js";
import { createDesignRunner } from "./runner.js";
import { createDesignSamples, type DesignSamples } from "./sample.js";
import type { DesignDocument } from "./schema.js";
import { designView, listDesignViews } from "./service.js";
import { createTemplate, saveTemplate } from "./templates.js";

let h: Harness;
const tick = () => new Promise((resolve) => setImmediate(resolve));
afterEach(() => h.cleanup());

const priced = (perImage: number | null) =>
  catalogueSchema.parse({
    ...designCatalogue,
    image: designCatalogue.image.map((model) => ({
      ...model,
      pricing: perImage === null ? {} : { perImage },
    })),
  });

interface Pending {
  readonly prompt: string;
  readonly resolve: (image: GeneratedImage) => void;
  readonly reject: (error: Error) => void;
}

function setup(
  options: {
    perImage?: number | null;
    budget?: number;
    plans?: boolean;
    doc?: DesignDocument;
  } = {},
) {
  h = designHarness();
  const calls: Pending[] = [];
  const catalogue = priced(options.perImage === undefined ? 0.04 : options.perImage);
  let samples: DesignSamples | undefined;
  const service = {
    ...h.deps,
    emit: (event: DesignEvent) => {
      h.events.push(event);
      if (event.type === "design.changed") samples?.designChanged(event.designId);
    },
  };
  const runner = createDesignRunner({
    ...service,
    catalogue: () => catalogue,
    generate: (request) =>
      new Promise<GeneratedImage>((resolve, reject) => {
        calls.push({ prompt: request.prompt, resolve, reject });
      }),
  });
  samples = createDesignSamples({
    service,
    runner,
    catalogue: () => catalogue,
    budget: () => options.budget ?? 1,
    plans: () => options.plans ?? false,
    timeZone: () => "UTC",
  });
  const made = createTemplate(service, {
    id: "t1",
    mutationId: "mutation-0001",
    name: "Gig poster",
    document: options.doc ?? poster(),
  });
  if (!made.ok) throw new Error(made.message);
  let version = 1;
  let doc = options.doc ?? poster();
  const save = (
    next: DesignDocument,
    acknowledgedHigh = 0.04,
    sample: "make" | "skip" = "make",
  ) => {
    const saved = saveTemplate(service, "t1", {
      baseVersion: version,
      name: "Gig poster",
      document: next,
    });
    if (!saved.ok) throw new Error(saved.message);
    version = saved.value.template.headVersion;
    const before = doc;
    doc = next;
    const result = (samples as DesignSamples).afterSave({
      templateId: "t1",
      version,
      before,
      after: next,
      sample,
      acknowledgedHigh,
    });
    if (!result.ok) throw new Error(result.message);
    return result.value;
  };
  const land = async (index: number) => {
    await tick();
    calls[index]?.resolve({ bytes: pngOf(1080, 1080, index), mime: "image/png" });
    for (let n = 0; n < 5; n += 1) await tick();
  };
  return { samples: samples as DesignSamples, runner, calls, save, land };
}

const prompt = (text: string) => poster({ picture: { ...poster().picture, prompt: text } });
const centered = (doc: DesignDocument) => ({
  ...doc,
  text: { ...doc.text, preset: "centered" as const },
});

describe("a design template's sample", () => {
  it("makes the artwork once, then redraws text-only Saves for free", async () => {
    const { samples, calls, save, land } = setup();
    const first = save(prompt("A neon stage"));
    expect(first?.state).toBe("making");
    await tick();
    expect(calls).toHaveLength(1);
    await land(0);
    expect(samples.state("t1")?.state).toBe("done");
    const designId = samples.state("t1")?.designId ?? "";
    const free = save(centered(prompt("A neon stage")));
    expect(free).toMatchObject({ state: "done", version: 3, designId });
    await tick();
    expect(calls).toHaveLength(1);
    expect(designView(h.db, designId)?.document).toMatchObject({ text: { preset: "centered" } });
    expect(h.events).toContainEqual({ type: "design-template.sample", templateId: "t1" });
  });

  it("is hidden from every list of designs", async () => {
    const { save, land } = setup();
    save(prompt("A neon stage"));
    await land(0);
    expect(listDesignViews(h.db)).toEqual([]);
  });

  it("makes nothing on a Save that skips the sample", async () => {
    const { samples, calls, save } = setup();
    expect(save(prompt("A neon stage"), 0.04, "skip")).toBeNull();
    await tick();
    expect(calls).toHaveLength(0);
    expect(samples.state("t1")).toBeNull();
  });

  it("holds a picture that costs more than was shown, and makes it on Make sample", async () => {
    const { samples, calls, save, land } = setup({ perImage: 0.4 });
    const held = save(prompt("A neon stage"), 0.2);
    expect(held).toMatchObject({ state: "held", quotedHigh: 0.4 });
    expect(held?.heldReason).toBe(
      "Waiting: this sample now costs about $0.40, more than the $0.20 you saw. Press Make sample ($0.40) to make it.",
    );
    await tick();
    expect(calls).toHaveLength(0);
    const cheap = samples.request("t1", 2, 0.2);
    expect(cheap.ok ? "made" : cheap.reason).toBe("cost-changed");
    await tick();
    expect(calls).toHaveLength(0);
    const made = samples.request("t1", 2, 0.4);
    expect(made.ok && made.value.state).toBe("making");
    await tick();
    expect(calls).toHaveLength(1);
    await land(0);
    expect(samples.state("t1")?.state).toBe("done");
  });

  it("holds a picture whose price is unknown", async () => {
    const { calls, save } = setup({ perImage: null });
    expect(save(prompt("A neon stage"))?.state).toBe("held");
    await tick();
    expect(calls).toHaveLength(0);
  });

  it("holds a sample that would go over today's budget", async () => {
    const { calls, save } = setup({ budget: 0.05 });
    h.db.exec(
      "INSERT INTO designs (id,kind,name,channel_id,values_json,sample_of,created_at,updated_at) VALUES ('old','design','Old','00000000-0000-4000-8000-000000000001','{}','t1','2026-10-18T09:00:00.000Z','2026-10-18T09:00:00.000Z')",
    );
    h.db.exec(
      "INSERT INTO standalone_usage(id,owner_kind,owner_id,channel_id,purpose,kind,provider,model,wall_ms,cost,created_at) VALUES ('u1','design','old','00000000-0000-4000-8000-000000000001','design-art','image','fal','fal-ai/flux-2',900,0.03,'2026-10-18T09:30:00.000Z')",
    );
    const held = save(prompt("A neon stage"));
    expect(held?.state).toBe("held");
    expect(held?.heldReason).toBe(
      "Waiting: this sample would take today's sample spending to $0.07, over the $0.05 a day samples may spend. Press Make sample to make it anyway; the limit starts again at midnight.",
    );
    await tick();
    expect(calls).toHaveLength(0);
  });

  it("holds a sample whose picture runs on a CLI plan until samples may use plans", async () => {
    const onPlan = (doc: DesignDocument): DesignDocument => ({
      ...doc,
      picture: { ...doc.picture, provider: "codex-image", model: "gpt-image" },
    });
    const off = setup();
    const held = off.save(onPlan(prompt("A neon stage")), 0);
    expect(held?.state).toBe("held");
    expect(held?.heldReason).toBe(
      "Waiting: this sample's picture runs on your CLI plan, and samples may not use CLI plans. Turn on Samples may use my CLI plans in Settings → Production defaults, or press Make sample to make it anyway.",
    );
    await tick();
    expect(off.calls).toHaveLength(0);
    h.cleanup();
    const on = setup({ plans: true });
    expect(on.save(onPlan(prompt("A neon stage")), 0)?.state).not.toBe("held");
  });

  it("never stops a picture being made: a newer Save waits, and replaces one still waiting", async () => {
    const { samples, calls, save, land } = setup();
    save(prompt("First"));
    expect(save(prompt("Second"))?.state).toBe("queued");
    expect(save(prompt("Third"))).toMatchObject({ state: "queued", version: 4 });
    await tick();
    expect(calls).toHaveLength(1);
    await land(0);
    await tick();
    expect(calls).toHaveLength(2);
    expect(calls[1]?.prompt).toMatch(/^Third/);
    expect(samples.state("t1")?.state).toBe("making");
    await land(1);
    expect(samples.state("t1")).toMatchObject({ state: "done", version: 4 });
  });

  it("says why a sample failed, and makes it again on Make sample", async () => {
    const { samples, calls, save, runner } = setup();
    save(prompt("A neon stage"));
    await tick();
    calls[0]?.reject(new Error("The model is busy."));
    await runner.idle();
    expect(samples.state("t1")?.state).toBe("failed");
    expect(samples.state("t1")?.heldReason).toContain("The model is busy.");
    expect(samples.request("t1", 2, 0.04).ok).toBe(true);
    await tick();
    expect(calls).toHaveLength(2);
  });

  it("asks for the sample values a field lacks", async () => {
    const { samples, save } = setup();
    save(poster({ samples: { Event: "Late Set" } }));
    expect(samples.state("t1")).toMatchObject({ state: "failed" });
    expect(samples.state("t1")?.heldReason).toBe(
      "The sample wasn't made: {{Date}}, {{Venue}}, {{Price}} have no sample value. Fill them in under Text layout → Sample values, then press Make sample.",
    );
  });

  it("settles a sample Slopify stopped while making, and starts one still waiting", async () => {
    const { samples, calls, save, runner } = setup();
    save(prompt("First"));
    await tick();
    save(prompt("Second"));
    // A restart: the design runner fails the picture it was making.
    runner.recover();
    samples.recover();
    for (let n = 0; n < 5; n += 1) await tick();
    await tick();
    expect(calls).toHaveLength(2);
    expect(samples.state("t1")?.state).toBe("making");
  });

  it("counts what other templates' samples are making against today's budget", async () => {
    const { samples, calls, save } = setup({ budget: 0.05 });
    expect(save(prompt("A neon stage"))?.state).toBe("making");
    const other = createTemplate(
      { ...h.deps },
      { id: "t2", mutationId: "mutation-0002", name: "Flyer", document: prompt("A quiet room") },
    );
    if (!other.ok) throw new Error(other.message);
    const second = samples.afterSave({
      templateId: "t2",
      version: 1,
      before: poster(),
      after: prompt("A quiet room"),
      sample: "make",
      acknowledgedHigh: 0.04,
    });
    expect(second.ok && second.value?.state).toBe("held");
    await tick();
    expect(calls).toHaveLength(1);
  });

  it("checks today's budget again when a waiting sample starts", async () => {
    const { samples, calls, save, land } = setup({ budget: 0.1 });
    save(prompt("First"));
    expect(save(prompt("Second"))?.state).toBe("queued");
    // Meanwhile another template's sample spent most of what was left.
    h.db.exec(
      "INSERT INTO designs (id,kind,name,channel_id,values_json,sample_of,created_at,updated_at) VALUES ('old','design','Old','00000000-0000-4000-8000-000000000001','{}','t9','2026-10-18T09:00:00.000Z','2026-10-18T09:00:00.000Z')",
    );
    h.db.exec(
      "INSERT INTO standalone_usage(id,owner_kind,owner_id,channel_id,purpose,kind,provider,model,wall_ms,cost,created_at) VALUES ('u1','design','old','00000000-0000-4000-8000-000000000001','design-art','image','fal','fal-ai/flux-2',900,0.07,'2026-10-18T09:30:00.000Z')",
    );
    await land(0);
    await tick();
    expect(calls).toHaveLength(1);
    expect(samples.state("t1")?.state).toBe("held");
    expect(samples.state("t1")?.heldReason).toContain("over the $0.10 a day samples may spend");
  });

  it("makes a sample whose price is unknown only when Make sample accepts that", async () => {
    const { samples, calls, save } = setup({ perImage: null });
    expect(save(prompt("A neon stage"))?.state).toBe("held");
    const refused = samples.request("t1", 2, 0);
    expect(refused.ok ? "made" : refused.reason).toBe("cost-changed");
    await tick();
    expect(calls).toHaveLength(0);
    expect(samples.request("t1", 2, 0, true).ok).toBe(true);
    await tick();
    expect(calls).toHaveLength(1);
  });
});
