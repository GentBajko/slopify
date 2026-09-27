import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { RunConfig } from "../admission/model.js";
import { storeImageBlob } from "../channels/images.js";
import { config } from "../rebuild/recipe-fixture.js";
import { defaultVoicesSettings, type Speaker } from "./model.js";
import { panelTiles } from "./panel.js";
import { writePortraits } from "./portraits.js";

const clock = fixedClock("2026-09-27T10:00:00.000Z");
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 7, 7]);

function podcast(speakers: readonly Speaker[], format: RunConfig["format"] = "16:9"): RunConfig {
  return {
    ...config,
    format,
    sources: { ...config.sources, audio: "generate" },
    voices: { ...defaultVoicesSettings("podcast"), speakers: [...speakers] },
  };
}
const speaker = (id: string, portrait?: string): Speaker => ({
  id,
  name: id,
  role: "host",
  voice: { provider: "voice", model: "tts", voice: id },
  ...(portrait === undefined ? {} : { portrait }),
});

describe("speaker panel portraits in the render", () => {
  it("writes each portrait beside the caption file at its speaker's tile", () => {
    const db = openDb(":memory:");
    migrate(db, clock);
    const directory = mkdtempSync(join(tmpdir(), "slopify-portraits-"));
    try {
      const sha256 = storeImageBlob(db, jpeg, "image/jpeg", clock.now().toISOString());
      // Nobody has a picture: nothing is written and the render keeps its arguments.
      expect(writePortraits(db, podcast([speaker("alex"), speaker("sam")]), directory)).toBe(
        undefined,
      );
      const written = writePortraits(
        db,
        podcast([speaker("alex"), speaker("sam", sha256)], "9:16"),
        directory,
      );
      const tile = panelTiles(2, { width: 1080, height: 1920 })[1];
      expect(written).toEqual({
        overlays: [{ path: "portrait-1.jpg", x: tile?.x, y: tile?.y, size: tile?.size }],
        recorded: [{ speaker: "sam", sha256 }],
      });
      expect(new Uint8Array(readFileSync(join(directory, "portrait-1.jpg")))).toEqual(jpeg);
      // Voices turned off (uploaded narration) read as the Narration format: no panel.
      const uploaded = podcast([speaker("sam", sha256)]);
      expect(
        writePortraits(
          db,
          { ...uploaded, sources: { ...uploaded.sources, audio: "provide" } },
          directory,
        ),
      ).toBe(undefined);
    } finally {
      rmSync(directory, { recursive: true, force: true });
      db.close();
    }
  });
});
