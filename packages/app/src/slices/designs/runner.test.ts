import { afterEach, describe, expect, it, vi } from "vitest";
import { editRefusal } from "../../catalog/schema.js";
import type { GeneratedImage } from "../../kernel/ports/image.js";
import { providerError } from "../../kernel/ports/model.js";
import { designCatalogue, designHarness, type Harness, pngOf } from "./designs.fake.js";
import { poster } from "./document.fake.js";
import { createDesignRunner, type DesignImageGenerator, type DesignRunner } from "./runner.js";
import { createDesign, designView } from "./service.js";

let h: Harness;
afterEach(() => h.cleanup());

type Asked = Parameters<DesignImageGenerator>[0];

function setup(
  answer: (asked: Asked, n: number) => Promise<GeneratedImage> = async () => ({
    bytes: pngOf(800, 800, 7),
    mime: "image/png",
  }),
  extra: { shrink?: (bytes: Uint8Array) => Promise<Uint8Array> } = {},
) {
  h = designHarness();
  const asked: Asked[] = [];
  const runner = createDesignRunner({
    ...h.deps,
    catalogue: () => designCatalogue,
    generate: (request) => {
      asked.push(request);
      return answer(request, asked.length);
    },
    ...extra,
  });
  const made = createDesign(h.deps, {
    id: "d1",
    mutationId: "mutation-0001",
    kind: "edit",
    name: "Me",
    stagedFileId: h.stage(pngOf(1080, 1920)),
  });
  if (!made.ok) throw new Error(made.message);
  return { runner, asked, first: made.value.steps[0]?.id ?? "" };
}

const edit = (from: string, extra: object = {}) => ({
  mutationId: `edit-${from}-${JSON.stringify(extra)}`,
  fromStepId: from,
  instruction: "Put me on a stage, evening light",
  provider: "fal",
  model: "fal-ai/flux-2",
  acknowledgedHigh: 0.06,
  ...extra,
});

function deferred() {
  let resolve: (image: GeneratedImage) => void = () => {};
  const promise = new Promise<GeneratedImage>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("editing a picture", () => {
  it("sends the version it starts from and lands the result as the next version", async () => {
    const { runner, asked, first } = setup();
    const started = runner.edit("d1", edit(first));
    expect(
      started.ok && started.value.steps.map((step) => [step.n, step.kind, step.state]),
    ).toEqual([
      [1, "upload", "ready"],
      [2, "edit", "making"],
    ]);
    await runner.idle();
    const view = designView(h.db, "d1");
    const second = view?.steps[1];
    expect([second?.state, second?.parentId, second?.width, view?.headStepId]).toEqual([
      "ready",
      first,
      800,
      second?.id,
    ]);
    expect(asked).toEqual([
      {
        designId: "d1",
        purpose: "picture-edit",
        provider: "fal",
        model: "fal-ai/flux-2",
        prompt: "Put me on a stage, evening light",
        aspect: "9:16",
        edit: { source: { bytes: pngOf(1080, 1920), mime: "image/png" } },
      },
    ]);
    const third = runner.edit("d1", edit(second?.id ?? "", { instruction: "Darker sky" }));
    await runner.idle();
    expect(third.ok && designView(h.db, "d1")?.steps[2]?.parentId).toBe(second?.id);
    expect(asked[1]?.edit?.source.bytes).toEqual(pngOf(800, 800, 7));
  });

  it("fails a step with the provider's reason, and Try again makes it", async () => {
    let fail = true;
    const { runner, first } = setup(async () => {
      if (fail) throw new Error("The model is busy.");
      return { bytes: pngOf(10, 10), mime: "image/png" };
    });
    runner.edit("d1", edit(first));
    await runner.idle();
    const failed = designView(h.db, "d1")?.steps[1];
    expect([failed?.state, failed?.error]).toEqual([
      "failed",
      "The picture couldn't be made: The model is busy. Press Try again, or choose another image model under Made with … · change.",
    ]);
    expect(designView(h.db, "d1")?.headStepId).toBe(first);
    fail = false;
    expect(runner.retry("d1", failed?.id ?? "").ok).toBe(true);
    await runner.idle();
    expect(designView(h.db, "d1")?.steps[1]?.state).toBe("ready");
    const again = runner.retry("d1", failed?.id ?? "");
    expect(again.ok ? "retried" : again.reason).toBe("busy");
    expect(runner.retry("d1", "nope").ok).toBe(false);
  });

  it("says the fix, not Try again, when the model can't edit a picture", async () => {
    const { runner, first } = setup(async () => {
      throw providerError({ kind: "unsupported", message: editRefusal });
    });
    runner.edit("d1", edit(first));
    await runner.idle();
    const failed = designView(h.db, "d1")?.steps[1];
    expect(failed?.error).toBe(`The picture couldn't be made: ${editRefusal}`);
    expect(failed?.error).not.toContain("Try again");
  });

  it("adds where to change the model to an unsupported refusal that doesn't say it", async () => {
    const { runner, first } = setup(async () => {
      throw providerError({ kind: "unsupported", message: "This size isn't offered." });
    });
    runner.edit("d1", edit(first));
    await runner.idle();
    expect(designView(h.db, "d1")?.steps[1]?.error).toBe(
      "The picture couldn't be made: This size isn't offered. Choose another image model under Made with … · change.",
    );
  });

  it("points a refused key at Settings → Providers", async () => {
    const { runner, first } = setup(async () => {
      throw providerError({ kind: "auth", message: "The key was rejected." });
    });
    runner.edit("d1", edit(first));
    await runner.idle();
    expect(designView(h.db, "d1")?.steps[1]?.error).toBe(
      "The picture couldn't be made: The key was rejected. Check the provider's key in Settings → Providers, then press Try again.",
    );
  });

  it("fails a step whose answer is not a picture", async () => {
    const { runner, first } = setup(async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      mime: "image/png",
    }));
    runner.edit("d1", edit(first));
    await runner.idle();
    expect(designView(h.db, "d1")?.steps[1]?.error).toMatch(/not a usable PNG or JPEG picture/);
  });

  it("runs at most two calls at once and starts the rest as they finish", async () => {
    const waits = [deferred(), deferred(), deferred()];
    let running = 0;
    let most = 0;
    const { runner, first } = setup(async (_asked, n) => {
      running += 1;
      most = Math.max(most, running);
      const image = await (waits[n - 1]?.promise ?? Promise.reject(new Error("extra call")));
      running -= 1;
      return image;
    });
    for (const n of [1, 2, 3])
      runner.edit("d1", edit(first, { instruction: `Change ${String(n)}` }));
    await vi.waitFor(() => expect(running).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(running).toBe(2);
    for (const wait of waits) wait.resolve({ bytes: pngOf(5, 5), mime: "image/png" });
    await runner.idle();
    expect(most).toBe(2);
    expect(designView(h.db, "d1")?.steps.map((step) => step.state)).toEqual([
      "ready",
      "ready",
      "ready",
      "ready",
    ]);
  });

  it("refuses an edit whose price rose past what was shown, starting nothing", () => {
    const { runner, asked, first } = setup();
    const refused = runner.edit("d1", edit(first, { acknowledgedHigh: 0.01 }));
    expect(
      refused.ok
        ? "started"
        : [refused.reason, refused.message, (refused.current as { high: number }).high],
    ).toEqual([
      "cost-changed",
      "The price changed since you looked: this edit now costs up to $0.06. Check the new price on the button and press it again.",
      0.06,
    ]);
    expect(designView(h.db, "d1")?.steps).toHaveLength(1);
    expect(asked).toEqual([]);
  });

  it("answers a repeated edit with the same step and refuses its id reused", async () => {
    const { runner, first } = setup();
    runner.edit("d1", edit(first));
    runner.edit("d1", edit(first));
    const reused = runner.edit("d1", { ...edit(first), instruction: "Something else" });
    expect(reused.ok ? "started" : reused.reason).toBe("mutation-reused");
    await runner.idle();
    expect(designView(h.db, "d1")?.steps).toHaveLength(2);
  });

  it("refuses without a provider, from a version still being made, or with a deleted cast member", async () => {
    const { runner, first } = setup(() => new Promise(() => {}));
    const reason = (input: object, id = "d1") => {
      const result = runner.edit(id, input);
      return result.ok ? "started" : result.message;
    };
    expect(reason({ ...edit(first), instruction: " " })).toBe(
      "Write what to change (at most 4,000 characters), then press Edit.",
    );
    expect(reason(edit(first), "gone")).toBe(
      "This design no longer exists. Open Library → Designs to choose another.",
    );
    expect(reason(edit(first, { castMemberIds: ["gone"] }))).toBe(
      "A cast member you chose was deleted. Choose the cast again, then press the button again.",
    );
    runner.edit("d1", edit(first, { instruction: "Wait" }));
    const making = designView(h.db, "d1")?.steps[1]?.id ?? "";
    expect(reason(edit(making))).toBe(
      "The version to edit has no picture yet. Wait for it to finish, or continue from another version.",
    );
    const bare = createDesignRunner({ ...h.deps, catalogue: () => designCatalogue });
    const none = bare.edit("d1", edit(first, { instruction: "x" }));
    expect(none.ok ? "started" : none.reason).toBe("no-image-provider");
  });

  it("sends a version over 10 MB shrunk, and fails without a way to shrink it", async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 10);
    big.set(pngOf(4000, 4000));
    const shrunk = pngOf(2000, 2000);
    const { runner, asked } = setup(async () => ({ bytes: big, mime: "image/png" }), {
      shrink: async () => shrunk,
    });
    const first = designView(h.db, "d1")?.steps[0]?.id ?? "";
    runner.edit("d1", edit(first));
    await runner.idle();
    const second = designView(h.db, "d1")?.steps[1]?.id ?? "";
    runner.edit("d1", edit(second));
    await runner.idle();
    expect(asked[1]?.edit?.source).toEqual({ bytes: shrunk, mime: "image/jpeg" });
  });

  it("fails what Slopify was making when it stopped", () => {
    const { runner, first } = setup(() => new Promise(() => {}));
    runner.edit("d1", edit(first));
    const restarted = createDesignRunner({ ...h.deps, catalogue: () => designCatalogue });
    expect(restarted.recover()).toBe(1);
    expect(designView(h.db, "d1")?.steps[1]?.error).toBe(
      "Slopify stopped while this picture was being made. Press Try again.",
    );
  });
});

describe("making a designed piece's artwork", () => {
  function piece(
    runner: DesignRunner,
    values: Record<string, string>,
    overrides: Parameters<typeof poster>[0] = {},
  ) {
    const made = createDesign(h.deps, {
      id: "d2",
      mutationId: "mutation-0002",
      kind: "design",
      name: "Gig",
      document: poster(overrides),
      values,
    });
    if (!made.ok) throw new Error(made.message);
    return runner;
  }
  const values = { Event: "Late Set", Date: "2026-11-14", Venue: "The Cellar", Price: "€12" };

  it("asks for one artwork in the formats' shape with the prompt's fields filled", async () => {
    const { runner, asked } = setup();
    piece(runner, values, {
      formats: [
        { format: "a4", focus: { x: 0.5, y: 0.5 } },
        { format: "story", focus: { x: 0.5, y: 0.5 } },
      ],
    });
    expect(runner.quoteArtwork("d2")).toMatchObject({ ok: true, value: { high: 0.04 } });
    const started = runner.artwork("d2", { mutationId: "art-00001", acknowledgedHigh: 0.04 });
    expect(started.ok).toBe(true);
    await runner.idle();
    expect(asked[0]).toMatchObject({ purpose: "design-art", aspect: "9:16", provider: "fal" });
    expect(asked[0]?.prompt).toBe(
      "A jazz club stage for Late Set, warm light\n\nLeave room for a title and details to be set over the picture; draw no text, letters or logos.",
    );
    expect(asked[0]?.edit).toBeUndefined();
    expect(designView(h.db, "d2")?.steps.map((step) => [step.kind, step.state])).toEqual([
      ["generate", "ready"],
    ]);
  });

  it("spells the text out for the AI when it draws the text itself", async () => {
    const { runner, asked } = setup();
    piece(runner, values, { picture: { ...poster().picture, aiText: true } });
    runner.artwork("d2", { mutationId: "art-00001", acknowledgedHigh: 0.04 });
    await runner.idle();
    expect(asked[0]?.prompt).toContain('"Late Set"\n"2026-11-14 · The Cellar · €12"');
  });

  it("names the fields it still needs, and refuses a design that uses its own picture", () => {
    const { runner } = setup();
    piece(runner, { Date: "x" });
    const missing = runner.artwork("d2", { mutationId: "art-00001", acknowledgedHigh: 0.04 });
    expect(missing.ok ? "started" : missing.message).toBe(
      "{{Event}} has no value. Fill it in under Fields, then press Make.",
    );
    h.db.exec(
      `UPDATE designs SET document_json='${JSON.stringify(poster({ picture: { ...poster().picture, source: "picture" } }))}' WHERE id='d2'`,
    );
    const own = runner.artwork("d2", { mutationId: "art-00002", acknowledgedHigh: 0.04 });
    expect(own.ok ? "started" : own.message).toMatch(
      /^This design uses its own picture as the artwork/,
    );
    const edit = runner.quoteArtwork("d1");
    expect(edit.ok ? "quoted" : edit.message).toMatch(/^This design has no settings/);
    const cheap = runner.artwork("d2", { mutationId: "x", acknowledgedHigh: 0 });
    expect(cheap.ok ? "started" : cheap.reason).toBe("invalid");
  });
});
