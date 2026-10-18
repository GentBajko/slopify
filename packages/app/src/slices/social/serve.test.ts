import { writeFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { insertDesign } from "../designs/repo.js";
import { defaultChoices } from "./defaults.js";
import { serveMedia } from "./serve.js";
import { type PackFixture, packFixture } from "./social.fake.js";

const now = new Date("2026-10-18T10:00:00.000Z");
let fixture: PackFixture | undefined;
afterEach(() => {
  fixture?.close();
  fixture = undefined;
});

describe("serveMedia", () => {
  it("draws a design picked for the post in the site's format, and says why it can't", async () => {
    const one = packFixture({
      social: { instagram: { ...defaultChoices.instagram, media: { designs: ["d1"] } } },
    });
    fixture = one;
    insertDesign(one.db, {
      id: "d1",
      kind: "design",
      name: "Poster",
      channelId: "00000000-0000-4000-8000-000000000001",
      projectId: "p1",
      document: {},
      values: {},
      mutationId: null,
      mutationHash: null,
      at: "t",
    });
    const target = `${one.paths.dataDir}/d1.png`;
    writeFileSync(target, "png");
    const formats: string[] = [];
    const drawn = await serveMedia(
      {
        ...one,
        renderDesign: async (_id, format) => {
          formats.push(format);
          return { ok: true, path: target };
        },
      },
      "p1",
      "design--d1--portrait",
      now,
      AbortSignal.timeout(5000),
    );
    expect(drawn).toMatchObject({ ok: true, path: target, contentType: "image/png" });
    expect(formats).toEqual(["portrait"]);
    const refused = await serveMedia(
      { ...one, renderDesign: async () => ({ ok: false, sentence: "Fix the design." }) },
      "p1",
      "design--d1--portrait",
      now,
      AbortSignal.timeout(5000),
    );
    expect(refused).toEqual({ ok: false, status: 404, sentence: "Fix the design." });
    const unset = await serveMedia(
      one,
      "p1",
      "design--d1--portrait",
      now,
      AbortSignal.timeout(5000),
    );
    expect(unset).toMatchObject({ ok: false, status: 503 });
  });
});
