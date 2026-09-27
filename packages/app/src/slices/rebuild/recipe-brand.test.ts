import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import { assColour, serializeAss } from "../subtitles/captions.js";
import { cardsAss } from "../video/cards.js";
import { planRender, withEndScreen } from "../video/plan.js";
import { config, content, emptyView } from "./recipe-fixture.js";
import { planRevision } from "./recipes.js";

// The brand kit's parts of the render: caption colours, the title style and the end screen.
// Each adds to a fingerprint only when set, so a project made before them stays up to date.
const narrated: RunConfig = {
  ...config,
  sources: { ...config.sources, audio: "generate" },
  subtitles: {
    mode: "burn-in",
    language: "en",
    fontId: "default",
    fontSize: 48,
    position: "bottom",
  },
};

function fingerprints(c: RunConfig) {
  const planned = planRevision(emptyView(c, content), { config: c, content });
  if (!planned.ok) throw new Error(JSON.stringify(planned.fields));
  return planned.fingerprints;
}

describe("brand kit fingerprints", () => {
  const before = fingerprints(narrated);

  it("stay as they were without caption colours, a title style or an end screen", () => {
    expect(fingerprints({ ...narrated, titleStyle: { color: "#FFD700" } })).toEqual(before);
    expect(fingerprints({ ...narrated, channelId: "c", cast: [] })).toEqual(before);
  });

  it("change the caption files and export when the caption colours are set", () => {
    const coloured = fingerprints({
      ...narrated,
      subtitles: {
        mode: "burn-in",
        language: "en",
        fontId: "default",
        fontSize: 48,
        position: "bottom",
        color: "#FFD700",
      },
    });
    expect(coloured["subtitles:files"]).not.toBe(before["subtitles:files"]);
    expect(coloured["export:video"]).not.toBe(before["export:video"]);
    expect(coloured["subtitles:timing"]).toBe(before["subtitles:timing"]);
  });

  it("change only the export for an end screen and its title style", () => {
    const ended = fingerprints({ ...narrated, endScreen: { text: "Subscribe" } });
    expect(ended["export:video"]).not.toBe(before["export:video"]);
    expect(ended["subtitles:files"]).toBe(before["subtitles:files"]);
    const styled = fingerprints({
      ...narrated,
      endScreen: { text: "Subscribe" },
      titleStyle: { color: "#FFD700" },
    });
    expect(styled["export:video"]).not.toBe(ended["export:video"]);
    expect(fingerprints({ ...narrated, endScreen: { text: "  " } })).toEqual(before);
  });
});

describe("brand kit rendering", () => {
  it("writes colours as ASS &HAABBGGRR, white and dark by default", () => {
    expect(assColour("#FFD700", "x")).toBe("&H0000D7FF");
    expect(assColour(undefined, "&H00FFFFFF")).toBe("&H00FFFFFF");
    const style = { width: 1920, height: 1080, fontName: "Barlow", fontSize: 48 };
    expect(serializeAss([], style)).toContain(
      "Style: Default,Barlow,48,&H00FFFFFF,&H00FFFFFF,&H00101010,",
    );
    expect(serializeAss([], { ...style, color: "#FF0000", outlineColor: "#0000FF" })).toContain(
      "Style: Default,Barlow,48,&H000000FF,&H000000FF,&H00FF0000,",
    );
    const edit = { width: 1920, height: 1080, fps: 30 };
    expect(cardsAss(edit, [], "Cinzel")).toContain("Style: Card,Cinzel,119,&H00FFFFFF,");
    expect(cardsAss(edit, [], "Cinzel", 0, "#FFD700")).toContain(
      "Style: Card,Cinzel,119,&H0000D7FF,",
    );
  });

  it("puts the end screen over the last five seconds and cuts a chapter card short", () => {
    const cards = [
      { title: "One", startFrame: 0, frames: 75 },
      { title: "Two", startFrame: 800, frames: 75 },
      { title: "Three", startFrame: 880, frames: 75 },
    ];
    expect(withEndScreen(cards, "Subscribe", 1000)).toEqual([
      { title: "One", startFrame: 0, frames: 75 },
      { title: "Two", startFrame: 800, frames: 50 },
      { title: "Subscribe", startFrame: 850, frames: 150 },
    ]);
    expect(withEndScreen(cards, undefined, 1000)).toEqual(cards);
    expect(withEndScreen([], "Bye", 60)).toEqual([{ title: "Bye", startFrame: 0, frames: 60 }]);
  });

  it("plans the end screen card with the title colour", () => {
    const plan = planRender({
      format: "16:9",
      gapSeconds: 0,
      edgeSeconds: 0,
      imageSeconds: 15,
      zoomPercent: 22.5,
      motionStyle: "zoom",
      body: { path: "/p/body.mp3", seconds: 30 },
      images: ["/p/1.png"],
      output: "/p/video.mp4",
      edit: {
        cards: {
          chapters: [],
          font: { path: "/f/cinzel.ttf", name: "Cinzel" },
          color: "#FFD700",
          endScreen: "Subscribe",
        },
      },
    });
    expect(plan.editList.cards).toEqual([{ title: "Subscribe", startFrame: 750, frames: 150 }]);
    expect(plan.editList.cardColor).toBe("#FFD700");
    expect(plan.editList.cardFont?.name).toBe("Cinzel");
  });
});
