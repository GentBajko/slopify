import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import type { KeptShort, ManifestOutput, ManifestPiece, RevisionView } from "../revisions/model.js";
import { config, content, emptyView } from "./recipe-fixture.js";
import { planRevision } from "./recipes.js";
import { movedShorts, withKeep } from "./shorts-keep-save.js";

const kept = (from: number): KeptShort => ({
  from,
  opening: `Opening ${String(from)}.`,
  closing: `Closing ${String(from)}.`,
  sentences: 3,
  title: `Short ${String(from)}`,
  description: "Line.",
  hashtags: ["#Lore"],
  why: "Stands alone.",
  seed: `seed-${String(from)}`,
});
const piece = (key: string) => ({ key, fingerprint: `fp-${key}` }) as unknown as ManifestPiece;
const output = (slot: string) =>
  ({ slot, workKey: slot, fingerprint: `fp-${slot}` }) as unknown as ManifestOutput;

describe("a save that keeps shorts", () => {
  it("numbers kept shorts by their place, drops hand-set ranges and moves their own tokens", () => {
    const { content: next, moves } = withKeep(
      {
        ...content,
        shortsRanges: { "2": { first: 1, last: 2, pick: "p" } },
        regenerationTokens: { "shorts:4": "redo-4", "shorts:2": "redo-2", "shorts:pick": "p" },
      },
      [kept(1), kept(4), kept(5)],
      3,
    );
    expect([...moves.entries()]).toEqual([
      [4, 2],
      [5, 3],
    ]);
    expect(next.shortsKeep?.map((one) => [one.from, one.title])).toEqual([
      [1, "Short 1"],
      [2, "Short 4"],
      [3, "Short 5"],
    ]);
    expect(next.shortsRanges).toBeUndefined();
    expect(next.regenerationTokens).toEqual({ "shorts:pick": "p", "shorts:2": "redo-4" });
    // At most the count.
    expect(withKeep(content, [kept(1), kept(2), kept(3)], 2).content.shortsKeep).toHaveLength(2);
  });

  it("moves a kept short's prompts and images to its new number, dropping what was there", () => {
    const manifest = {
      outputs: ["shorts:2:image:1", "shorts:4:image:1", "shorts:4:render", "shorts:1:image:1"].map(
        output,
      ),
      pieces: ["shorts:2:prompts", "shorts:4:prompts", "shorts:pick", "article:body"].map(piece),
    };
    const moved = movedShorts(manifest, new Map([[4, 2]]));
    expect(moved.outputs.map((row) => [row.slot, row.fingerprint])).toEqual([
      ["shorts:2:image:1", "fp-shorts:4:image:1"],
      ["shorts:2:render", "fp-shorts:4:render"],
      ["shorts:1:image:1", "fp-shorts:1:image:1"],
    ]);
    expect(moved.pieces.map((row) => [row.key, row.fingerprint])).toEqual([
      ["shorts:2:prompts", "fp-shorts:4:prompts"],
      ["shorts:pick", "fp-shorts:pick"],
      ["article:body", "fp-article:body"],
    ]);
    expect(movedShorts(manifest, new Map())).toBe(manifest);
  });
});

describe("saving an edit that would pick the shorts again", () => {
  const five = {
    ...config,
    sources: { ...config.sources, audio: "generate" as const },
    imageSeconds: 20,
    shorts: { enabled: true, count: 5, minSeconds: 15, maxSeconds: 60 },
  } satisfies RunConfig;
  const sentences = Array.from({ length: 20 }, (_value, at) => ({
    start: at * 10,
    end: at * 10 + 9.5,
    text: `Sentence ${String(at + 1)}.`,
  }));
  const clip = (number: number) => ({
    number,
    first: number * 3,
    last: number * 3 + 1,
    start: (number * 3 - 1) * 10,
    end: number * 3 * 10 + 9.75,
    title: `Short ${String(number)}`,
    description: "Line.",
    hashtags: ["#Lore"],
    why: "Stands alone.",
    text: "",
    seed: `seed-${String(number)}`,
  });
  // Five shorts picked, of which 1, 4 and 5 are rendered.
  function base(): RevisionView {
    const view = emptyView(five);
    const view2 = {
      ...view,
      pieces: [
        {
          key: "shorts:pick",
          stageKind: "video" as const,
          assetId: null,
          fingerprint: "picked-before",
          piece: {
            id: "pick",
            stageId: "video",
            kind: "article_written" as const,
            idx: 1,
            state: "done" as const,
            payload: JSON.stringify({
              shorts: [1, 2, 3, 4, 5].map(clip),
              durationSeconds: 200,
              sentences,
            }),
          },
          recordId: "pick",
          publicationId: null,
          selected: true,
          available: true,
        },
      ],
      outputs: [1, 4, 5].map((number) => ({
        slot: `shorts:${String(number)}:render`,
        workKey: `shorts:${String(number)}:render`,
        assetId: `render-${String(number)}`,
        output: {
          kind: "video",
          path: `short-${String(number)}.mp4`,
          meta: { short: number, sentences: [number * 3, number * 3 + 1] },
        },
        fingerprint: `rendered-${String(number)}`,
        state: "ready" as const,
        recordId: `render-${String(number)}`,
        publicationId: null,
        selected: true,
        available: true,
      })),
    };
    return view2 as unknown as RevisionView;
  }

  it("keeps the finished shorts, numbered 1, 2, 3, when the count drops to 3", () => {
    const plan = planRevision(base(), {
      config: { ...five, shorts: { ...five.shorts, count: 3 } },
      content,
    });
    if (!plan.ok) throw new Error(JSON.stringify(plan.fields));
    expect(plan.content.shortsKeep?.map((one) => [one.from, one.title, one.opening])).toEqual([
      [1, "Short 1", "Sentence 3."],
      [2, "Short 4", "Sentence 12."],
      [3, "Short 5", "Sentence 15."],
    ]);
    expect(plan.shortMoves).toEqual([
      [4, 2],
      [5, 3],
    ]);
    // Short 4's render, under its new number.
    expect(plan.manifest.outputs.find((row) => row.slot === "shorts:2:render")?.fingerprint).toBe(
      "rendered-4",
    );
  });

  it("keeps every finished short and picks only the extra ones when the count rises", () => {
    const plan = planRevision(base(), {
      config: { ...five, shorts: { ...five.shorts, count: 6 } },
      content,
    });
    if (!plan.ok) throw new Error(JSON.stringify(plan.fields));
    expect(plan.content.shortsKeep?.map((one) => one.title)).toEqual([
      "Short 1",
      "Short 4",
      "Short 5",
    ]);
  });

  it("picks every short anew when asked to, and keeps the person's own choice", () => {
    const fresh = planRevision(base(), {
      config: { ...five, shorts: { ...five.shorts, count: 3 } },
      content,
      regenerate: ["shorts:pick"],
    });
    if (!fresh.ok) throw new Error(JSON.stringify(fresh.fields));
    expect(fresh.content.shortsKeep).toBeUndefined();
    const chosen = planRevision(base(), {
      config: { ...five, shorts: { ...five.shorts, count: 3 } },
      content: { ...content, shortsKeep: [kept(5)] },
    });
    if (!chosen.ok) throw new Error(JSON.stringify(chosen.fields));
    expect(chosen.content.shortsKeep?.map((one) => [one.from, one.title])).toEqual([
      [1, "Short 5"],
    ]);
    expect(chosen.shortMoves).toEqual([[5, 1]]);
  });
});
