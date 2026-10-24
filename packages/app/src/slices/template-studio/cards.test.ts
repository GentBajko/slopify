import { describe, expect, it } from "vitest";
import { draftFixture } from "../play-drafts/draft.fake.js";
import { cardFacts } from "./cards.js";

const fixture = draftFixture();
const base = fixture.document;
fixture.close();

describe("cardFacts", () => {
  it("says what a template makes: format, voice by its saved name, length, captions and shorts", () => {
    const document = {
      ...base,
      expectedWords: "2200",
      form: {
        ...base.form,
        title: "History: {{Topic}}",
        format: "9:16" as const,
        audio: { ...base.form.audio, provider: "openai-tts", voice: "fable" },
        sources: { ...base.form.sources, audio: "generate" as const, document: "off" as const },
        subtitles: { ...base.form.subtitles, mode: "burn-in" as const },
        shorts: {
          enabled: true,
          count: "2",
          minSeconds: "45",
          maxSeconds: "90",
          prompt: "",
          imagePrompt: "",
          titleOnScreen: true,
        },
      },
    };
    expect(
      cardFacts(document, [{ provider: "openai-tts", voiceId: "fable", name: "Fable" }]),
    ).toMatchObject({
      format: "9:16",
      words: 2200,
      voice: { provider: "openai-tts", voiceId: "fable", name: "Fable" },
      captions: "burn-in",
      shorts: 2,
      pdf: false,
      asks: ["Topic"],
    });
  });

  it("names a voice missing from Settings → Voices by its id, and leaves out what is off", () => {
    const document = {
      ...base,
      form: {
        ...base.form,
        audio: { ...base.form.audio, provider: "elevenlabs", voice: "x1" },
        sources: { ...base.form.sources, audio: "generate" as const, article: "off" as const },
        shorts: undefined,
      },
    };
    const facts = cardFacts(document, []);
    expect(facts.voice?.name).toBe("x1");
    expect(facts.words).toBeNull();
    expect(facts.shorts).toBe(0);
  });
});
