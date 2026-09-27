import type { Voice } from "@app/slices/settings/model.js";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageSelect, languageHelp } from "./language-select";
import { useVoicesForLanguage, VoiceLanguageNote } from "./voice-language";
import { languagesOfText, voiceLanguagesText } from "./voice-languages-cell";

afterEach(cleanup);

describe("the language control", () => {
  it("names the inherited language and hands back a code, or undefined for it", async () => {
    const onChange = vi.fn();
    render(
      <LanguageSelect
        value={undefined}
        inherited={{ label: "Channel's language", language: "de" }}
        onChange={onChange}
      />,
    );
    const select = screen.getByLabelText("Language");
    expect(screen.getByRole("option", { name: "Channel's language (German)" })).toBeTruthy();
    await userEvent.selectOptions(select, "es");
    expect(onChange).toHaveBeenLastCalledWith("es");
    await userEvent.selectOptions(select, "");
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("says what the language changes and how its captions are timed", () => {
    expect(languageHelp("en")).toBe("Everything is written and timed in English.");
    expect(languageHelp("es")).toMatch(/written in Spanish.*248 MB model/);
    expect(languageHelp("ja")).toMatch(/sentence by sentence/);
  });
});

const voices: readonly Voice[] = [
  { id: "1", provider: "cartesia", name: "Ana", voiceId: "a", languages: ["es"] },
  { id: "2", provider: "cartesia", name: "Bob", voiceId: "b", languages: ["en"] },
  { id: "3", provider: "cartesia", name: "Cleo", voiceId: "c" },
];

function Picker({ chosen }: { readonly chosen?: string }) {
  const list = useVoicesForLanguage(voices, "es", chosen);
  return (
    <>
      <ul>
        {list.listed.map((voice) => (
          <li key={voice.id}>{voice.name}</li>
        ))}
      </ul>
      <VoiceLanguageNote
        language="es"
        voice={voices.find((voice) => voice.voiceId === chosen)}
        hidden={list.hidden}
        showAll={list.showAll}
        onShowAll={list.setShowAll}
      />
    </>
  );
}

describe("voices by language", () => {
  it("lists the language's voices and offers the rest behind Show all voices", async () => {
    render(<Picker />);
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Ana",
      "Cleo",
    ]);
    await userEvent.click(screen.getByRole("checkbox", { name: /Show all voices/ }));
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("warns, without blocking, when the chosen voice is listed for another language", () => {
    render(<Picker chosen="b" />);
    expect(screen.getByRole("status").textContent).toMatch(/Bob is listed for English/);
  });

  it("reads and shows a voice's languages", () => {
    expect(languagesOfText(" ES, de;pt ")).toEqual(["es", "de", "pt"]);
    expect(voiceLanguagesText({ languages: ["es", "xx"] })).toBe("Spanish, xx");
    expect(voiceLanguagesText({})).toBe("Any (not known)");
  });
});
