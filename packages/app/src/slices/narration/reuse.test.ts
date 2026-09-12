import { expect, it } from "vitest";
import { type NarrationPlanInput, planNarration } from "./plan.js";

const group = (key: string, text: string, wholeRequest = false) => ({
  key,
  text,
  wholeRequest,
  segment: "body" as const,
  regenerationToken: null,
});
const input: NarrationPlanInput = {
  groups: [group("audio:body:a", "First paragraph."), group("audio:body:b", "Second paragraph.")],
  provider: "openai-tts",
  model: "m",
  voice: "v",
  maxCharacters: 1000,
  retained: [],
};
it("reuses unchanged paragraphs but never mixes changed voices", () => {
  const first = planNarration(input);
  const retained = first.map((one, index) => ({
    requestFingerprint: one.requestFingerprint,
    fingerprint: one.fingerprint,
    assetId: `asset-${index}`,
    available: true,
  }));
  const changed = planNarration({
    ...input,
    retained,
    groups: [group("audio:body:a", "Edited first paragraph."), input.groups[1] ?? group("bad", "")],
  });
  expect(changed.map((one) => one.assetId)).toEqual([null, "asset-1"]);
  expect(
    planNarration({ ...input, retained, voice: "different" }).every((one) => one.assetId === null),
  ).toBe(true);
});
it("rebuilds every physical part of an edited whole-request group", () => {
  const original = {
    ...input,
    maxCharacters: 8,
    groups: [group("audio:body:whole", "Alpha. Beta.", true)],
  };
  const first = planNarration(original);
  const retained = first.map((one, index) => ({
    ...one,
    assetId: `whole-${index}`,
    available: true,
  }));
  const changed = planNarration({
    ...original,
    retained,
    groups: [group("audio:body:whole", "Alpha. Gamma.", true)],
  });
  expect(changed.every((one) => one.assetId === null)).toBe(true);
});
it("normalizes line endings before hashing and submitting without folding internal whitespace", () => {
  const first = planNarration({ ...input, groups: [group("a", "  A\r\nB  C\rD  ")] });
  expect(first[0]?.text).toBe("A\nB  C\nD");
  expect(first[0]?.logicalText).toBe("A\nB  C\nD");
  const retained = first.map((one) => ({ ...one, assetId: "saved", available: true }));
  expect(
    planNarration({ ...input, retained, groups: [group("b", "A\nB  C\nD")] })[0]?.assetId,
  ).toBe("saved");
  expect(
    planNarration({ ...input, retained, groups: [group("b", "A\nB C\nD")] })[0]?.assetId,
  ).toBeNull();
});
it("does not invent a request for empty source or reuse unavailable bytes", () => {
  expect(planNarration({ ...input, groups: [group("blank", " \r\n ")] })).toEqual([]);
  const first = planNarration(input);
  const retained = first.map((one) => ({ ...one, assetId: "missing", available: false }));
  expect(planNarration({ ...input, retained }).every((one) => one.assetId === null)).toBe(true);
});
it("reuses physical requests across logical boundary changes", () => {
  const first = planNarration({ ...input, maxCharacters: 4, groups: [group("a", "abcdefgh")] });
  const retained = first.map((one, index) => ({
    ...one,
    assetId: `part-${index}`,
    available: true,
  }));
  const next = planNarration({
    ...input,
    maxCharacters: 4,
    retained,
    groups: [group("new-a", "abcd"), group("new-b", "efgh")],
  });
  expect(next.map((one) => [one.key, one.assetId])).toEqual([
    ["new-a:1", "part-0"],
    ["new-b:1", "part-1"],
  ]);
});
it("regenerates every part with a new logical token and reuses a completed retry", () => {
  const original = { ...input, maxCharacters: 8, groups: [group("a", "Alpha. Beta.")] };
  const first = planNarration(original);
  const retained = first.map((one, index) => ({
    ...one,
    assetId: `old-${index}`,
    available: true,
  }));
  const changed = {
    ...original,
    retained,
    groups: [{ ...group("a", "Alpha. Beta."), regenerationToken: "again" }],
  };
  const regenerated = planNarration(changed);
  expect(regenerated.every((one) => one.assetId === null)).toBe(true);
  const finished = regenerated.map((one, index) => ({
    ...one,
    assetId: `new-${index}`,
    available: true,
  }));
  expect(
    planNarration({ ...changed, retained: [...retained, ...finished] }).map((one) => one.assetId),
  ).toEqual(["new-0", "new-1"]);
});
