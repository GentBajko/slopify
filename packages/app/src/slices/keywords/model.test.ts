import { describe, expect, it } from "vitest";
import { isReserved, keywordPlaces, reservedPrefix } from "./model.js";
import { keywordOf, keywordSpecs, keywordsFor, legacyNames } from "./specs.js";

describe("keywordSpecs", () => {
  it("names every keyword with the reserved prefix and words joined by underscores", () => {
    for (const spec of keywordSpecs) {
      expect(spec.name.startsWith(reservedPrefix)).toBe(true);
      expect(spec.name).toMatch(/^Slopify_[A-Z][a-z]+(_[A-Z][a-z]+)*$/);
    }
  });

  it("lists each name once", () => {
    const names = keywordSpecs.map((spec) => spec.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("explains every keyword: what it fills, an example, when it exists and a place", () => {
    for (const spec of keywordSpecs) {
      expect(spec.fills.trim()).not.toBe("");
      expect(spec.example.trim()).not.toBe("");
      expect(spec.available.trim()).not.toBe("");
      expect(spec.places.length).toBeGreaterThan(0);
      for (const place of spec.places) expect(keywordPlaces).toContain(place);
    }
  });

  it("holds both batches of the spec, Scene and Appearance included", () => {
    expect(keywordSpecs.map((spec) => spec.name)).toEqual([
      "Slopify_Title",
      "Slopify_Channel",
      "Slopify_Series",
      "Slopify_Chapters",
      "Slopify_Links",
      "Slopify_Previous_Video",
      "Slopify_Next_Video",
      "Slopify_Release_Date",
      "Slopify_Episode",
      "Slopify_Duration",
      "Slopify_Cast",
      "Slopify_Covered_Before",
      "Slopify_Brand",
      "Slopify_Summary",
      "Slopify_Hook",
      "Slopify_Thumbnail_Text",
      "Slopify_Key_Facts",
      "Slopify_Quote",
      "Slopify_Tags",
      "Slopify_Scene",
      "Slopify_Setting",
      "Slopify_Mood",
      "Slopify_Appearance",
    ]);
  });

  it("never lets a keyword fill the title", () => {
    for (const spec of keywordSpecs) expect(spec.places).not.toContain("title");
  });

  it("keeps article-made keywords out of the prompts that write the article", () => {
    for (const name of ["Slopify_Chapters", "Slopify_Summary", "Slopify_Hook", "Slopify_Scene"]) {
      const places = keywordOf(name)?.places ?? [];
      expect(places).not.toContain("article");
      expect(places).not.toContain("script");
    }
  });

  it("puts the picture keywords in image and thumbnail prompts only", () => {
    for (const name of ["Slopify_Scene", "Slopify_Setting", "Slopify_Mood", "Slopify_Appearance"])
      expect(keywordOf(name)?.places).toEqual(["image", "thumbnail"]);
    expect(keywordOf("Slopify_Brand")?.places).toEqual(["image", "thumbnail"]);
  });

  it("prices each keyword as free or part of one AI call", () => {
    expect(keywordOf("Slopify_Title")?.cost).toBe("free");
    expect(keywordOf("Slopify_Summary")?.cost).toBe("digest");
    expect(keywordOf("Slopify_Setting")?.cost).toBe("scenes");
    expect(keywordOf("Slopify_Appearance")?.cost).toBe("appearance");
  });
});

describe("keywordOf", () => {
  it("finds a keyword by its name", () => {
    expect(keywordOf("Slopify_Hook")?.filler).toBe("digest");
  });

  it("finds Scene and Appearance by their old names too", () => {
    expect(keywordOf("Scene")?.name).toBe("Slopify_Scene");
    expect(keywordOf("Appearance")?.name).toBe("Slopify_Appearance");
    expect(legacyNames).toEqual(["Scene", "Appearance"]);
  });

  it("is case-sensitive like every slot name, so a near miss is no keyword", () => {
    expect(keywordOf("slopify_hook")).toBeUndefined();
    expect(keywordOf("scene")).toBeUndefined();
    expect(keywordOf("Title")).toBeUndefined();
  });

  it("answers a name Object's prototype holds with nothing", () => {
    expect(keywordOf("constructor")).toBeUndefined();
  });
});

describe("isReserved", () => {
  it("reserves the whole prefix, whatever its case", () => {
    expect(isReserved("Slopify_Anything")).toBe(true);
    expect(isReserved("slopify_title")).toBe(true);
    expect(isReserved("SLOPIFY_X")).toBe(true);
  });

  it("leaves ordinary names free", () => {
    expect(isReserved("Title")).toBe(false);
    expect(isReserved("Slopify")).toBe(false);
    expect(isReserved("My Slopify_Title")).toBe(false);
  });
});

describe("keywordsFor", () => {
  it("lists the keywords a place can use, in registry order", () => {
    const names = keywordsFor("article").map((spec) => spec.name);
    expect(names).toContain("Slopify_Title");
    expect(names).toContain("Slopify_Covered_Before");
    expect(names).not.toContain("Slopify_Chapters");
    expect(names).not.toContain("Slopify_Duration");
  });

  it("lists none for the title", () => {
    expect(keywordsFor("title")).toEqual([]);
  });
});
