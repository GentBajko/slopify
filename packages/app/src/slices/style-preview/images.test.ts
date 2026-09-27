import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { layout } from "../../kernel/paths.js";
import { insertImageBlob } from "../channels/repo.js";
import { stagingPath } from "../storage/layout.js";
import { insertStagedFile } from "../storage/repo.js";
import { pictureExtension, previewPictures } from "./images.js";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 9, 9]);
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
let scratch = "";

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "slopify-preview-pictures-"));
});
afterEach(() => rmSync(scratch, { recursive: true, force: true }));

function fixture() {
  const db = openDb(":memory:");
  migrate(db, fixedClock("2026-09-27T10:00:00.000Z"));
  const paths = layout(join(scratch, "data"));
  mkdirSync(paths.staging, { recursive: true });
  return { db, paths, pictures: previewPictures({ db, paths }) };
}

function stage(
  deps: ReturnType<typeof fixture>,
  id: string,
  bytes: Uint8Array,
  state: "staged" | "copying" = "staged",
): void {
  writeFileSync(stagingPath(deps.paths, id), bytes);
  insertStagedFile(deps.db, {
    id,
    stageKind: "images",
    path: id,
    originalFilename: "reference.png",
    bytes: bytes.length,
    state,
    createdAt: "2026-09-27T10:00:00.000Z",
  });
}

it("reads a draft's uploaded establishing image and a cast picture, named by their bytes", () => {
  const deps = fixture();
  stage(deps, "11111111-1111-4111-8111-111111111111", png);
  insertImageBlob(deps.db, { sha256: sha(jpeg), mime: "image/jpeg", bytes: jpeg }, "now");
  expect(
    deps.pictures({ kind: "upload", stagedFileId: "11111111-1111-4111-8111-111111111111" }),
  ).toEqual({ bytes: png, extension: ".png", sha256: sha(png) });
  expect(deps.pictures({ kind: "picture", sha256: sha(jpeg) })).toEqual({
    bytes: jpeg,
    extension: ".jpg",
    sha256: sha(jpeg),
  });
});

it("finds nothing for a missing, half-copied or non-picture file, so the stills are used", () => {
  const deps = fixture();
  stage(deps, "22222222-2222-4222-8222-222222222222", png, "copying");
  stage(deps, "33333333-3333-4333-8333-333333333333", new Uint8Array([1, 2, 3, 4]));
  expect(
    deps.pictures({ kind: "upload", stagedFileId: "22222222-2222-4222-8222-222222222222" }),
  ).toBeUndefined();
  expect(
    deps.pictures({ kind: "upload", stagedFileId: "33333333-3333-4333-8333-333333333333" }),
  ).toBeUndefined();
  expect(deps.pictures({ kind: "upload", stagedFileId: "missing" })).toBeUndefined();
  expect(deps.pictures({ kind: "picture", sha256: "a".repeat(64) })).toBeUndefined();
  expect(deps.pictures({ kind: "output", outputId: "missing" })).toBeUndefined();
});

it("tells PNG, JPEG and WebP apart by their bytes", () => {
  expect(pictureExtension(png)).toBe(".png");
  expect(pictureExtension(jpeg)).toBe(".jpg");
  expect(pictureExtension(new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "))).toBe(
    ".webp",
  );
  expect(pictureExtension(new TextEncoder().encode("ID3 audio"))).toBeUndefined();
});
