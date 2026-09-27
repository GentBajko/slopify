import { describe, expect, it } from "vitest";
import { spellers, spokenNumber } from "./spell.js";

const say = (language: string, value: number): string =>
  spellers[language]?.cardinal(value) ?? "missing";

describe("number spellers", () => {
  it("spells Spanish", () => {
    expect(say("es", 0)).toBe("cero");
    expect(say("es", 16)).toBe("dieciséis");
    expect(say("es", 22)).toBe("veintidós");
    expect(say("es", 45)).toBe("cuarenta y cinco");
    expect(say("es", 100)).toBe("cien");
    expect(say("es", 115)).toBe("ciento quince");
    expect(say("es", 500)).toBe("quinientos");
    expect(say("es", 1990)).toBe("mil novecientos noventa");
    expect(say("es", 21000)).toBe("veintiún mil");
    expect(say("es", 2_000_001)).toBe("dos millones uno");
    expect(say("es", 1_000_000)).toBe("un millón");
  });

  it("spells German as one word below a million, with the year form", () => {
    expect(say("de", 1)).toBe("eins");
    expect(say("de", 21)).toBe("einundzwanzig");
    expect(say("de", 30)).toBe("dreißig");
    expect(say("de", 101)).toBe("einhunderteins");
    expect(say("de", 1990)).toBe("eintausendneunhundertneunzig");
    expect(spellers.de?.year?.(1990)).toBe("neunzehnhundertneunzig");
    expect(spellers.de?.alternatives?.(1990)).toEqual(["tausendneunhundertneunzig"]);
    expect(spokenNumber("1990", spellers.de ?? spellers.es!)[0]).toBe("neunzehnhundertneunzig");
    expect(say("de", 2_500_000)).toBe("zwei millionen fünfhunderttausend");
  });

  it("spells French with its seventies and eighties", () => {
    expect(say("fr", 17)).toBe("dix sept");
    expect(say("fr", 21)).toBe("vingt et un");
    expect(say("fr", 71)).toBe("soixante et onze");
    expect(say("fr", 77)).toBe("soixante dix sept");
    expect(say("fr", 80)).toBe("quatre vingts");
    expect(say("fr", 91)).toBe("quatre vingt onze");
    expect(say("fr", 200)).toBe("deux cents");
    expect(say("fr", 80000)).toBe("quatre vingt mille");
    expect(say("fr", 1990)).toBe("mille neuf cent quatre vingt dix");
  });

  it("spells Italian with elision and the accented tre", () => {
    expect(say("it", 21)).toBe("ventuno");
    expect(say("it", 28)).toBe("ventotto");
    expect(say("it", 23)).toBe("ventitré");
    expect(say("it", 3)).toBe("tre");
    expect(say("it", 180)).toBe("centottanta");
    expect(say("it", 2020)).toBe("duemilaventi");
    expect(say("it", 1000)).toBe("mille");
  });

  it("spells Portuguese with e and the European variants", () => {
    expect(say("pt", 21)).toBe("vinte e um");
    expect(say("pt", 100)).toBe("cem");
    expect(say("pt", 101)).toBe("cento e um");
    expect(say("pt", 1500)).toBe("mil e quinhentos");
    expect(say("pt", 1990)).toBe("mil novecentos e noventa");
    expect(spellers.pt?.alternatives?.(16)).toEqual(["dezasseis"]);
  });

  it("spells Catalan", () => {
    expect(say("ca", 21)).toBe("vint i u");
    expect(say("ca", 35)).toBe("trenta cinc");
    expect(say("ca", 300)).toBe("tres cents");
    expect(say("ca", 21000)).toBe("vint i un mil");
  });

  it("spells Dutch with ën and the year form", () => {
    expect(say("nl", 22)).toBe("tweeëntwintig");
    expect(say("nl", 21)).toBe("eenentwintig");
    expect(say("nl", 100)).toBe("honderd");
    expect(say("nl", 1200)).toBe("duizend tweehonderd");
    expect(spellers.nl?.year?.(1990)).toBe("negentienhonderdnegentig");
    expect(spellers.nl?.alternatives?.(1200)).toEqual(["duizendtweehonderd"]);
  });

  it("spells Polish and Czech with the count's noun form", () => {
    expect(say("pl", 2000)).toBe("dwa tysiące");
    expect(say("pl", 5000)).toBe("pięć tysięcy");
    expect(say("pl", 12000)).toBe("dwanaście tysięcy");
    expect(say("pl", 22000)).toBe("dwadzieścia dwa tysiące");
    expect(say("pl", 1000)).toBe("tysiąc");
    expect(say("cs", 200)).toBe("dvě stě");
    expect(say("cs", 300)).toBe("tři sta");
    expect(say("cs", 2000)).toBe("dva tisíce");
    expect(say("cs", 5000)).toBe("pět tisíc");
    expect(say("cs", 21)).toBe("dvacet jedna");
    expect(spellers.cs?.alternatives?.(21)).toEqual(["dvacet jeden"]);
  });
});

describe("spokenNumber", () => {
  const es = spellers.es;
  if (es === undefined) throw new Error("no Spanish speller");
  it("reads grouped thousands and decimal commas", () => {
    expect(spokenNumber("1.000", es)).toEqual(["mil"]);
    expect(spokenNumber("3,5", es)).toEqual(["tres coma cinco"]);
    expect(spokenNumber("3,25", es)).toEqual(["tres coma veinticinco", "tres coma dos cinco"]);
  });

  it("offers both readings of an ambiguous separator", () => {
    expect(spokenNumber("1,500", es)).toContain("mil quinientos");
    expect(spokenNumber("1,500", es)).toContain("uno coma quinientos");
  });

  it("reads very long numbers digit by digit", () => {
    expect(spokenNumber("12345678901234", es)[0]).toBe(
      "uno dos tres cuatro cinco seis siete ocho nueve cero uno dos tres cuatro",
    );
  });
});
