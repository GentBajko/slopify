import { describe, expect, it } from "vitest";
import { legacyDiceMasterTheme } from "./legacy-dicemaster.js";
import {
  defaultDocumentTheme,
  documentThemeOf,
  documentThemes,
  draftDocumentThemeOf,
} from "./model.js";
import {
  builtInTheme,
  defaultTheme,
  parseHexColor,
  resolvedDocumentTheme,
  resolveTheme,
} from "./theme.js";
import { documentSettingsSchema } from "./theme-schema.js";

describe("parseHexColor", () => {
  it("parses six-digit and shorthand hex, with or without #", () => {
    expect(parseHexColor("#8c1e14")).toEqual({ r: 140, g: 30, b: 20 });
    expect(parseHexColor("fff")).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("rejects anything else", () => {
    expect(() => parseHexColor("red")).toThrow(/hex color/);
  });
});

describe("resolveTheme", () => {
  it("returns the Plain defaults when given nothing", () => {
    expect(resolveTheme()).toEqual(defaultTheme());
    expect(defaultTheme()).toEqual(builtInTheme("plain"));
    expect(defaultTheme()).toMatchObject({
      page: { format: "a4", margin: 22 },
      sizes: { brand: 31, title: 22, section: 19, heading: 17, body: 10.5 },
      spacing: { bodyLine: 8, headingLine: 11 },
      dropCap: { lines: 3, scale: 3 },
      brand: { name: null },
    });
  });

  it("merges one section deep and leaves the rest of the section alone", () => {
    const theme = resolveTheme({ colors: { heading: "#123456" }, endPage: { enabled: false } });
    expect(theme.colors.heading).toBe("#123456");
    expect(theme.colors.text).toBe(defaultTheme().colors.text);
    expect(theme.endPage.enabled).toBe(false);
    expect(theme.endPage.title).toBe(defaultTheme().endPage.title);
  });

  it("does not change the defaults it merges onto", () => {
    resolveTheme({ endPage: { lines: ["changed"] } });
    expect(defaultTheme().endPage.lines).toEqual([]);
    resolveTheme({ endPage: { lines: ["changed"] } }, legacyDiceMasterTheme);
    expect(builtInTheme("dicemaster").endPage.lines).toHaveLength(11);
  });

  it("throws on unknown sections, unknown keys and bad colours", () => {
    expect(() => resolveTheme({ colour: {} } as never)).toThrow(/section "colour"/);
    expect(() => resolveTheme({ colors: { headline: "#000" } } as never)).toThrow(
      /colors.headline/,
    );
    expect(() => resolveTheme({ colors: { text: "black" } })).toThrow(/colors.text/);
  });
});

describe("builtInTheme", () => {
  it("makes plain an unbranded flat page on the same layout", () => {
    const plain = builtInTheme("plain");
    expect(plain.background).toEqual({ image: null, color: "#fdfaf3" });
    expect(plain.brand).toEqual({ name: null, url: null, tagline: null, linkLabel: null });
    expect(plain.metadata).toEqual({ author: "", subject: "{title}", keywords: "", creator: "" });
    expect(plain.endPage.enabled).toBe(false);
    expect(JSON.stringify(plain).toLowerCase()).not.toContain("dicemaster");
    expect(plain.sizes).toEqual(builtInTheme("dicemaster").sizes);
  });

  it("still gives a project saved with DiceMaster, or with no theme, the values it had", () => {
    expect(builtInTheme("dicemaster")).toEqual(legacyDiceMasterTheme);
    expect(resolvedDocumentTheme({ theme: "dicemaster" })).toEqual(legacyDiceMasterTheme);
    expect(resolvedDocumentTheme(undefined)).toEqual(legacyDiceMasterTheme);
  });

  it("offers Plain alone, and keeps reading the retired name", () => {
    expect(documentThemes).toEqual(["plain"]);
    expect(defaultDocumentTheme).toBe("plain");
    expect(documentSettingsSchema.parse({ theme: "dicemaster" })).toEqual({ theme: "dicemaster" });
    expect(documentThemeOf(undefined)).toBe("dicemaster");
    expect(draftDocumentThemeOf(undefined)).toBe("plain");
  });

  it("lets the parchment texture be any theme's background", () => {
    expect(resolveTheme({ background: { image: "parchment" } }).background.image).toBe("parchment");
  });
});

it("draws a project's own copy of a Library theme", () => {
  const values = { ...builtInTheme("plain"), page: { ...builtInTheme("plain").page, margin: 30 } };
  expect(resolvedDocumentTheme({ theme: "dicemaster" }).page.margin).toBe(22);
  expect(
    resolvedDocumentTheme({ theme: "dicemaster", custom: { id: "t1", name: "Mine", values } }),
  ).toEqual(values);
});
