import { expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { layout } from "../../kernel/paths.js";
import { storeImageBlob } from "../channels/images.js";
import { imageCall } from "./runtime-image.js";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 5]);
const input = {
  kind: "image" as const,
  version: 1 as const,
  provider: "codex-image",
  model: "codex-imagegen",
  prompt: "Tiamat over Waterdeep",
  aspect: "16:9" as const,
};

function deps() {
  const db = openDb(":memory:");
  migrate(db, fixedClock("2026-09-27T00:00:00.000Z"));
  return { db, paths: layout("/nowhere") };
}

it("sends each mentioned member's pictures, read by hash", () => {
  const d = deps();
  const sha = storeImageBlob(d.db, png, "image/png", "a");
  const call = imageCall(d, "p1", {
    ...input,
    cast: [{ name: "Tiamat", description: "dragon", images: [sha] }],
  });
  expect(call.cast).toEqual([
    { name: "Tiamat", description: "dragon", images: [{ bytes: png, mime: "image/png" }] },
  ]);
  expect(imageCall(d, "p1", input)).not.toHaveProperty("cast");
});

it("says what to do when a picture the project names is not in the database", () => {
  const d = deps();
  expect(() =>
    imageCall(d, "p1", {
      ...input,
      cast: [{ name: "Tiamat", description: "", images: ["0".repeat(64)] }],
    }),
  ).toThrow(
    "A picture of Tiamat that this project was started with is not in this Slopify's database, so it can't be sent as a reference. Add the picture again in Channels → Cast, then start the video again from Play.",
  );
});
