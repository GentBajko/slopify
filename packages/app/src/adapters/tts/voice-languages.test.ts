import { describe, expect, it } from "vitest";
import { cartesiaTts } from "./cartesia.js";
import { elevenLabsTts } from "./elevenlabs.js";
import {
  cartesiaLanguages,
  elevenLabsLanguages,
  inworldLanguages,
  primaryLanguages,
} from "./voice-languages.js";

describe("voice languages from provider APIs", () => {
  it("reduces codes to primary subtags, once each", () => {
    expect(primaryLanguages(["es-MX", "ES_ES", "en", null, "", "x"])).toEqual(["es", "en"]);
    expect(primaryLanguages([undefined])).toBeUndefined();
  });

  it("reads ElevenLabs' verified languages and labels", () => {
    expect(
      elevenLabsLanguages({
        verified_languages: [{ language: "es", locale: "es-MX" }, { language: "pt" }],
        labels: { language: "es" },
      }),
    ).toEqual(["es", "pt"]);
    expect(elevenLabsLanguages({ labels: {} })).toBeUndefined();
  });

  it("reads Cartesia's language and accents", () => {
    expect(cartesiaLanguages({ language: "fr", accents: [{ locale: "fr-CA" }] })).toEqual(["fr"]);
  });

  it("reads Inworld's language codes and prompt languages", () => {
    expect(
      inworldLanguages({ langCode: "EN_US", languageCode: "en-US", promptLanguages: ["de-DE"] }),
    ).toEqual(["en", "de"]);
    expect(inworldLanguages({ voice: { langCode: "IT_IT" } })).toEqual(["it"]);
  });

  it("asks the provider for one voice and answers undefined on any failure", async () => {
    const requests: string[] = [];
    const eleven = elevenLabsTts({
      key: () => "key",
      fetch: async (url) => {
        requests.push(String(url));
        return Response.json({ verified_languages: [{ language: "de" }] });
      },
    });
    const signal = new AbortController().signal;
    expect(await eleven.voiceLanguages?.("voice 1", signal)).toEqual(["de"]);
    expect(requests).toEqual(["https://api.elevenlabs.io/v1/voices/voice%201"]);
    const failing = cartesiaTts({
      key: () => "key",
      fetch: async () => new Response("no", { status: 404 }),
    });
    expect(await failing.voiceLanguages?.("x", signal)).toBeUndefined();
    const keyless = cartesiaTts({
      key: () => undefined,
      fetch: async () => {
        throw new Error("must not be called");
      },
    });
    expect(await keyless.voiceLanguages?.("x", signal)).toBeUndefined();
  });
});
