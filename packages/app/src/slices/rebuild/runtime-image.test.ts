import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it } from "vitest";
import { layout } from "../../kernel/paths.js";
import { imageCall } from "./runtime-image.js";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function deps(rows: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "slopify-runtime-image-"));
  roots.push(root);
  const paths = layout(root);
  const db = {
    prepare: () => ({
      get: (id: string) => (rows[id] === undefined ? undefined : { path: rows[id] }),
    }),
  } as unknown as DatabaseSync;
  return { db, paths };
}
const input = {
  kind: "image" as const,
  version: 1 as const,
  provider: "codex-image",
  model: "codex-imagegen",
  prompt: "A fox",
  aspect: "16:9" as const,
};

it("asks exactly what an image asked before when nothing new is set", () => {
  expect(imageCall(deps({}), "p1", input, "Image 1")).toEqual({
    provider: "codex-image",
    model: "codex-imagegen",
    prompt: "A fox",
    aspect: "16:9",
    previewLabel: "Image 1",
  });
});

it("sends the effort and the establishing image's bytes", () => {
  const d = deps({ ref: "assets/reference.png" });
  mkdirSync(join(d.paths.projects, "p1", "assets"), { recursive: true });
  writeFileSync(join(d.paths.projects, "p1", "assets", "reference.png"), png);
  const call = imageCall(d, "p1", {
    ...input,
    model: "gpt-6-sol",
    thinking: "ultra",
    reference: { fingerprint: "f", assetId: "ref" },
  });
  expect(call.thinking).toBe("ultra");
  expect(call.reference?.mime).toBe("image/png");
  expect(Buffer.from(call.reference?.bytes ?? [])).toEqual(png);
});

it("says what to do when the establishing image is missing or not a PNG or JPEG", () => {
  expect(() =>
    imageCall(deps({}), "p1", { ...input, reference: { fingerprint: "f", assetId: null } }),
  ).toThrow(/Regenerate on the establishing image in the Images section/);
  const d = deps({ ref: "assets/reference.webp" });
  mkdirSync(join(d.paths.projects, "p1", "assets"), { recursive: true });
  writeFileSync(join(d.paths.projects, "p1", "assets", "reference.webp"), Buffer.from("RIFF...."));
  expect(() =>
    imageCall(d, "p1", { ...input, reference: { fingerprint: "f", assetId: "ref" } }),
  ).toThrow(/Upload a PNG or JPEG in Edit project → Images → Establishing image/);
});
