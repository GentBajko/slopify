import { describe, expect, it } from "vitest";
import {
  defaultSpeechVoice,
  detectSpeech,
  parseEspeakVoices,
  parseSayVoices,
  parseWindowsVoices,
  piperVoices,
  primaryLanguage,
  type SpeechProbe,
} from "./system-speech.js";

const answers =
  (table: Readonly<Record<string, string>>): SpeechProbe =>
  (binary, args) => {
    const key = binary === "sh" ? `sh ${args.at(-1)}` : binary;
    const stdout = table[key];
    return Promise.resolve(
      stdout === undefined ? { ran: false, stdout: "" } : { ran: true, stdout },
    );
  };

describe("the system voice's speech programs", () => {
  it("reads macOS's voices, names with spaces and brackets included", () => {
    const voices = parseSayVoices(
      [
        "Albert              en_US    # Hello! My name is Albert.",
        "Eddy (English (US)) en_US    # Hello! My name is Eddy.",
        "Samantha            en_US    # Hello! My name is Samantha.",
        "Thomas              fr_FR    # Bonjour, je m’appelle Thomas.",
      ].join("\n"),
    );
    expect(voices.map((voice) => voice.id)).toEqual([
      "Albert",
      "Eddy (English (US))",
      "Samantha",
      "Thomas",
    ]);
    expect(defaultSpeechVoice({ id: "say", name: "macOS voices", voices })?.id).toBe("Samantha");
    expect(primaryLanguage(voices[3] ?? { id: "", name: "" })).toBe("fr");
  });

  it("reads Windows' installed voices", () => {
    expect(
      parseWindowsVoices("Microsoft David Desktop\ten-US\r\nMicrosoft Hedda Desktop\tde-DE\r\n"),
    ).toEqual([
      { id: "Microsoft David Desktop", name: "David", language: "en-US" },
      { id: "Microsoft Hedda Desktop", name: "Hedda", language: "de-DE" },
    ]);
  });

  it("reads eSpeak's voices and picks American English first", () => {
    const voices = parseEspeakVoices(
      [
        "Pty Language       Age/Gender VoiceName          File                 Other Languages",
        " 5  af              --/M      Afrikaans          gmw/af",
        " 2  en-gb           --/M      English_(Great_Britain) gmw/en           (en 2)",
        " 5  en-us           --/M      English_(America)  gmw/en-US            (en 3)",
      ].join("\n"),
    );
    expect(voices.map((voice) => voice.id)).toEqual(["af", "en-gb", "en-us"]);
    expect(voices[2]?.name).toBe("English (America)");
    expect(defaultSpeechVoice({ id: "espeak-ng", name: "eSpeak NG", voices })?.id).toBe("en-us");
  });

  it("offers Piper only with a voice model named in SLOPIFY_PIPER_VOICES", () => {
    expect(piperVoices({})).toEqual([]);
    expect(
      piperVoices({ SLOPIFY_PIPER_VOICES: "/v/en_US-lessac-medium.onnx:/v/readme.txt" }),
    ).toEqual([
      { id: "/v/en_US-lessac-medium.onnx", name: "en_US-lessac-medium", language: "en_US" },
    ]);
  });

  it("lists every program found on Linux, best first", async () => {
    const found = await detectSpeech(
      answers({
        "sh pico2wave": "/usr/bin/pico2wave",
        "espeak-ng": " 5  en-us  --/M  English_(America)  gmw/en-US\n",
      }),
      { platform: "linux", env: {} },
    );
    expect(found.issue).toBeUndefined();
    expect(found.engines.map((engine) => engine.id)).toEqual(["pico2wave", "espeak-ng"]);
  });

  it("asks macOS and Windows their own way", async () => {
    const mac = await detectSpeech(answers({ say: "Samantha  en_US  # Hi\n" }), {
      platform: "darwin",
      env: {},
    });
    expect(mac.engines[0]).toMatchObject({ id: "say", name: "macOS voices" });
    const windows = await detectSpeech(answers({ powershell: "Microsoft Zira Desktop\ten-US\n" }), {
      platform: "win32",
      env: {},
    });
    expect(windows.engines[0]?.voices[0]).toMatchObject({ id: "Microsoft Zira Desktop" });
  });

  it("names the fix when nothing speaks, and a probe that throws finds nothing", async () => {
    const none = await detectSpeech(() => Promise.reject(new Error("no local programs here")), {
      platform: "linux",
      env: {},
    });
    expect(none.engines).toEqual([]);
    expect(none.issue).toMatch(/Install espeak-ng.*Settings → Providers/);
  });
});
