import { describe, expect, it } from "vitest";
import { voiceLanguageWarning, voiceSpeaks, voicesForLanguage } from "./languages.js";

const voices = [
  { voiceId: "a", name: "Ana", languages: ["es"] },
  { voiceId: "b", name: "Bob", languages: ["en"] },
  { voiceId: "c", name: "Cleo" },
];

describe("voices by language", () => {
  it("offers voices that speak the language and voices whose languages are unknown", () => {
    expect(voicesForLanguage(voices, "es", false).map((voice) => voice.voiceId)).toEqual([
      "a",
      "c",
    ]);
    expect(voicesForLanguage(voices, undefined, false).map((voice) => voice.voiceId)).toEqual([
      "b",
      "c",
    ]);
  });

  it("shows every voice when asked, and always keeps the chosen one", () => {
    expect(voicesForLanguage(voices, "es", true)).toHaveLength(3);
    expect(voicesForLanguage(voices, "es", false, "b").map((voice) => voice.voiceId)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("warns, naming the fix, when the voice is listed for other languages", () => {
    expect(voiceSpeaks({ languages: ["de", "en"] }, "de")).toBe(true);
    expect(voiceLanguageWarning(voices[0], "es")).toBeUndefined();
    expect(voiceLanguageWarning(voices[2], "es")).toBeUndefined();
    expect(voiceLanguageWarning(voices[1], "es")).toMatch(
      /Bob is listed for English, not Spanish.*Settings → Voices/,
    );
  });
});
