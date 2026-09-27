import { describe, expect, it } from "vitest";
import {
  languageInfo,
  languageInstruction,
  wordTimingUnavailable,
  withLanguage,
  writingSystemOf,
} from "./languages.js";

describe("project languages", () => {
  it("reads absent as English", () => {
    expect(languageInfo(undefined).code).toBe("en");
    expect(languageInfo("xx").code).toBe("en");
    expect(languageInfo("de")).toMatchObject({ name: "German", timing: "multilingual" });
  });

  it("adds no instruction for English, so English requests stay byte-identical", () => {
    const messages = [{ role: "user", content: "Write about rope." }] as const;
    expect(languageInstruction(undefined)).toBeUndefined();
    expect(languageInstruction("en")).toBeUndefined();
    expect(withLanguage(messages, undefined)).toBe(messages);
    expect(withLanguage(messages, "en")).toBe(messages);
  });

  it("appends the instruction after the user's prompt without editing it", () => {
    const [message] = withLanguage([{ role: "user", content: "Write about rope." }], "es");
    expect(message?.content.startsWith("Write about rope.\n\n")).toBe(true);
    expect(message?.content).toContain("in Spanish (Español)");
  });

  it("puts the instruction in the system message when there is one", () => {
    const messages = withLanguage(
      [
        { role: "system", content: "Return JSON." },
        { role: "user", content: "The source text." },
      ],
      "fr",
    );
    expect(messages[0]?.content).toContain("French");
    expect(messages[1]?.content).toBe("The source text.");
  });

  it("explains why word timing is off for languages timed by sentence", () => {
    expect(wordTimingUnavailable("en")).toBeUndefined();
    expect(wordTimingUnavailable("es")).toBeUndefined();
    expect(wordTimingUnavailable("ja")).toMatch(/Japanese.*sentence by sentence/);
  });

  it("knows the writing system of a letter", () => {
    expect(writingSystemOf("ñ".codePointAt(0) ?? 0)).toBe("latin");
    expect(writingSystemOf("Ж".codePointAt(0) ?? 0)).toBe("cyrillic");
    expect(writingSystemOf("字".codePointAt(0) ?? 0)).toBe("cjk");
    expect(writingSystemOf("!".codePointAt(0) ?? 0)).toBeUndefined();
  });
});
