import { describe, expect, it } from "vitest";
import { defaultSubtitles, subtitleConfigSchema } from "./model.js";

describe("subtitle configuration", () => {
  it("keeps subtitles off for existing runs and defaults English captions", () => {
    expect(defaultSubtitles.mode).toBe("off");
    expect(subtitleConfigSchema.parse({ mode: "files" })).toEqual({
      mode: "files",
      language: "en",
      fontId: "default",
      fontSize: 48,
      position: "bottom",
    });
  });
  it.each([
    { mode: "burn-in", fontId: "../../secrets.ttf" },
    { mode: "files", fontSize: 0 },
    { mode: "files", fontSize: 121 },
    { mode: "files", fontSize: 32.5 },
    { mode: "files", language: "unknown" },
    { mode: "burn-in", position: "anywhere" },
  ])("rejects invalid subtitle settings: %j", (value) => {
    expect(subtitleConfigSchema.safeParse(value).success).toBe(false);
  });
});
