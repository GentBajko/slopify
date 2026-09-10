import { describe, expect, it } from "vitest";
import { insertPiece, piecesOf } from "../../kernel/runner/piece-repo.js";
import { harness } from "../control/control.fake.js";
import { planNarration } from "./plan.js";

describe("bounded narration plans", () => {
  it("splits an old 82k whole request and preserves completed neighboring audio on retry", () => {
    const h = harness({ audio: "failed" });
    let n = 0;
    const text = "x".repeat(82687);
    insertPiece(h.db, {
      id: "oversized",
      stageId: "s-audio",
      kind: "chunk",
      idx: 1,
      state: "failed",
      payload: JSON.stringify({ text }),
    });
    const saved = JSON.stringify({ text: "Already narrated.", file: "audio-chunks/002.mp3" });
    insertPiece(h.db, {
      id: "kept",
      stageId: "s-audio",
      kind: "chunk",
      idx: 2,
      state: "done",
      payload: saved,
    });
    const plan = planNarration(
      { db: h.db, ids: { next: () => `new-${++n}` } },
      "s-audio",
      [],
      10000,
      (p) => p.state === "done",
    );
    expect(plan).toHaveLength(10);
    expect(plan.at(-1)).toMatchObject({ id: "kept", idx: 10, state: "done", payload: saved });
    const texts = plan.slice(0, -1).map((p) => {
      const data: unknown = JSON.parse(p.payload ?? "null");
      if (!data || typeof data !== "object" || !("text" in data) || typeof data.text !== "string")
        throw new Error("Invalid payload");
      return data.text;
    });
    expect(texts.join("")).toBe(text);
    expect(texts.every((t) => t.length <= 10000)).toBe(true);
    expect(
      planNarration(
        { db: h.db, ids: { next: () => "never" } },
        "s-audio",
        [],
        10000,
        (p) => p.state === "done",
      ),
    ).toEqual(piecesOf(h.db, "s-audio", "chunk"));
    h.db.close();
  });
});
