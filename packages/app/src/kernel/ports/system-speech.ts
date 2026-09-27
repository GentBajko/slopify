// The speech a computer already has, found when asked: macOS's `say`, Windows' built-in
// System.Speech through PowerShell, and on Linux Piper, SVOX Pico, eSpeak NG or eSpeak, best
// first. No key and no charge. It lives in the kernel because the settings slice (readiness)
// and the TTS adapter both read it, and neither may import the other.

export const speechEngineIds = [
  "say",
  "sapi",
  "piper",
  "pico2wave",
  "espeak-ng",
  "espeak",
] as const;
export type SpeechEngineId = (typeof speechEngineIds)[number];

export const speechEngineNames: Readonly<Record<SpeechEngineId, string>> = {
  say: "macOS voices",
  sapi: "Windows voices",
  piper: "Piper",
  pico2wave: "SVOX Pico",
  "espeak-ng": "eSpeak NG",
  espeak: "eSpeak",
};

export interface SpeechVoice {
  // What the engine is handed: a voice name (say, Windows), a language (eSpeak, Pico) or a
  // model file (Piper).
  readonly id: string;
  readonly name: string;
  // A BCP 47-ish tag as the engine spells it ("en_US", "en-us"), when it says.
  readonly language?: string | undefined;
}

export interface SpeechEngine {
  readonly id: SpeechEngineId;
  readonly name: string;
  readonly voices: readonly SpeechVoice[];
}

export interface DetectedSpeech {
  // Best first; empty when this computer has none.
  readonly engines: readonly SpeechEngine[];
  // Why there is none, and what fixes it. Set exactly when `engines` is empty.
  readonly issue?: string | undefined;
}

// Structurally `slices/settings/cli-status.ts`'s CliProbe: runs a binary with arguments and
// says whether it exited cleanly, with its output.
export type SpeechProbe = (
  binary: string,
  args: readonly string[],
  timeoutMs: number,
) => Promise<{ readonly ran: boolean; readonly stdout: string }>;

export interface SpeechHost {
  readonly platform: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}

const probeTimeoutMs = 15_000;

// Windows lists the enabled voices as "name<TAB>culture" lines.
export const windowsVoiceListScript =
  "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; foreach ($v in $s.GetInstalledVoices()) { if ($v.Enabled) { Write-Output ($v.VoiceInfo.Name + [char]9 + $v.VoiceInfo.Culture.Name) } }; $s.Dispose()";

// SVOX Pico ships exactly these six.
const picoVoices: readonly SpeechVoice[] = [
  { id: "en-US", name: "English (US)", language: "en-US" },
  { id: "en-GB", name: "English (UK)", language: "en-GB" },
  { id: "de-DE", name: "German", language: "de-DE" },
  { id: "es-ES", name: "Spanish", language: "es-ES" },
  { id: "fr-FR", name: "French", language: "fr-FR" },
  { id: "it-IT", name: "Italian", language: "it-IT" },
];

export const noSpeechFix =
  "or add an ElevenLabs or OpenAI key in Settings → Providers for a better voice.";

export async function detectSpeech(given: SpeechProbe, host: SpeechHost): Promise<DetectedSpeech> {
  // A probe that throws (a host bridge that cannot run local programs) found nothing.
  const probe: SpeechProbe = (binary, args, timeoutMs) =>
    Promise.resolve()
      .then(() => given(binary, args, timeoutMs))
      .catch(() => ({ ran: false, stdout: "" }));
  const engines: SpeechEngine[] = [];
  const add = (id: SpeechEngineId, voices: readonly SpeechVoice[]) => {
    if (voices.length > 0) engines.push({ id, name: speechEngineNames[id], voices });
  };
  if (host.platform === "darwin") {
    const listed = await probe("say", ["-v", "?"], probeTimeoutMs);
    if (listed.ran) add("say", parseSayVoices(listed.stdout));
    return engines.length > 0
      ? { engines }
      : {
          engines,
          issue: `macOS's speech command (say) didn't answer, so the system voice can't narrate. Check that /usr/bin/say runs in Terminal, ${noSpeechFix}`,
        };
  }
  if (host.platform === "win32") {
    const listed = await probe(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", windowsVoiceListScript],
      probeTimeoutMs,
    );
    if (listed.ran) add("sapi", parseWindowsVoices(listed.stdout));
    return engines.length > 0
      ? { engines }
      : {
          engines,
          issue: `Windows' built-in speech didn't answer through PowerShell, or no voice is installed. Add a voice in Windows Settings → Time & language → Speech, ${noSpeechFix}`,
        };
  }
  const piperModels = piperVoices(host.env);
  const [piper, pico, espeakNg, espeak] = await Promise.all([
    // Without a voice model Piper can't speak, so it isn't even asked.
    piperModels.length > 0 ? isPiperTts(probe) : Promise.resolve(false),
    onPath(probe, "pico2wave"),
    probe("espeak-ng", ["--voices"], probeTimeoutMs),
    probe("espeak", ["--voices"], probeTimeoutMs),
  ]);
  if (piper) add("piper", piperModels);
  if (pico) add("pico2wave", picoVoices);
  if (espeakNg.ran) add("espeak-ng", parseEspeakVoices(espeakNg.stdout));
  if (espeak.ran) add("espeak", parseEspeakVoices(espeak.stdout));
  if (engines.length > 0) return { engines };
  return {
    engines,
    issue:
      host.env.SLOPIFY_CONTAINER === "1"
        ? `Slopify runs in Docker and this image has no speech program, so the system voice can't narrate. Update the image (docker compose pull, then docker compose up -d), ${noSpeechFix}`
        : `No speech program was found on this computer, so the system voice can't narrate. Install espeak-ng (for example sudo apt install espeak-ng, sudo pacman -S espeak-ng or sudo dnf install espeak-ng) and reload Settings → Providers, ${noSpeechFix}`,
  };
}

async function onPath(probe: SpeechProbe, binary: string): Promise<boolean> {
  // `command -v` answers for a program on PATH without running it: Pico and Piper have no
  // harmless flag that exits cleanly.
  return (await probe("sh", ["-c", 'command -v "$1"', "sh", binary], probeTimeoutMs)).ran;
}

// `piper` on PATH is not always Piper the voice engine: libratbag's mouse settings app has the
// same name (/usr/bin/piper on many desktops). The engine is told apart by its help, which names
// --model and an output option (the C++ build prints it on stderr, hence 2>&1), or failing that
// by a version line that names piper-tts. Anything else, or no answer, is not Piper.
async function isPiperTts(probe: SpeechProbe): Promise<boolean> {
  const ask = (flag: string) =>
    probe("sh", ["-c", '"$1" "$2" 2>&1; exit 0', "sh", "piper", flag], probeTimeoutMs);
  const help = await ask("--help");
  if (help.ran && isPiperTtsHelp(help.stdout)) return true;
  const version = await ask("--version");
  return version.ran && isPiperTtsVersion(version.stdout);
}

export function isPiperTtsHelp(text: string): boolean {
  return /--model\b/.test(text) && /--output[-_](?:file|dir|raw)\b/.test(text);
}

export function isPiperTtsVersion(text: string): boolean {
  return /\bpiper[-_ ]tts\b/i.test(text);
}

// Piper needs a voice model file; SLOPIFY_PIPER_VOICES lists them (.onnx paths, separated like
// PATH). Without one, Piper can't speak and is left out.
export function piperVoices(env: Readonly<Record<string, string | undefined>>): SpeechVoice[] {
  return (env.SLOPIFY_PIPER_VOICES ?? "")
    .split(":")
    .map((path) => path.trim())
    .filter((path) => path.endsWith(".onnx"))
    .map((path) => {
      const name = (path.split("/").pop() ?? path).replace(/\.onnx$/, "");
      const language = /^([a-z]{2,3}_[A-Z]{2})/.exec(name)?.[1];
      return { id: path, name, ...(language === undefined ? {} : { language }) };
    });
}

// `say -v ?`: "Samantha            en_US    # Hello! My name is Samantha." A name may carry
// single spaces and brackets ("Eddy (English (US))"), so the language is the anchor.
export function parseSayVoices(stdout: string): SpeechVoice[] {
  const voices: SpeechVoice[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^(.+?)\s+([a-z]{2,3}[_-][A-Za-z0-9_-]+)\s+#/.exec(line);
    if (match?.[1] === undefined || match[2] === undefined) continue;
    const name = match[1].trim();
    if (!voices.some((voice) => voice.id === name))
      voices.push({ id: name, name, language: match[2] });
  }
  return voices;
}

export function parseWindowsVoices(stdout: string): SpeechVoice[] {
  const voices: SpeechVoice[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const [name, culture] = line.split("\t").map((part) => part.trim());
    if (name === undefined || name === "" || voices.some((voice) => voice.id === name)) continue;
    voices.push({
      id: name,
      name: name.replace(/^Microsoft\s+/, "").replace(/\s+Desktop$/, ""),
      ...(culture === undefined || culture === "" ? {} : { language: culture }),
    });
  }
  return voices;
}

// `espeak-ng --voices`: a header, then " 5  en-us  --/M  English_(America)  gmw/en-US ...".
export function parseEspeakVoices(stdout: string): SpeechVoice[] {
  const voices: SpeechVoice[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4 || !/^\d+$/.test(parts[0] ?? "")) continue;
    const [, language, , name] = parts;
    if (language === undefined || name === undefined) continue;
    if (voices.some((voice) => voice.id === language)) continue;
    voices.push({ id: language, name: name.replace(/_/g, " "), language });
  }
  return voices;
}

// The voice a first short uses when none is saved: an English one, American first.
export function defaultSpeechVoice(engine: SpeechEngine): SpeechVoice | undefined {
  const english = (voice: SpeechVoice, tag: RegExp) => tag.test(voice.language ?? voice.id);
  return (
    engine.voices.find((voice) => voice.name === "Samantha") ??
    engine.voices.find((voice) => english(voice, /^en[-_]us$/i)) ??
    engine.voices.find((voice) => english(voice, /^en\b|^en[-_]/i)) ??
    engine.voices[0]
  );
}

// The primary language subtag ("en" from "en_US"), as Settings → Voices records it.
export function primaryLanguage(voice: SpeechVoice): string | undefined {
  const tag = /^([a-z]{2,3})(?:[-_]|$)/i.exec(voice.language ?? "")?.[1];
  return tag?.toLowerCase();
}

// One look per minute: readiness is asked on every Settings and Play load, and starting four
// processes each time is wasted work for something that changes when a program is installed.
const cacheMs = 60_000;
const cached = new WeakMap<
  SpeechProbe,
  Map<string, { readonly at: number; readonly found: Promise<DetectedSpeech> }>
>();

export function detectSpeechCached(probe: SpeechProbe, host: SpeechHost): Promise<DetectedSpeech> {
  const now = performance.now();
  const key = [
    host.platform,
    host.env.SLOPIFY_CONTAINER ?? "",
    host.env.SLOPIFY_PIPER_VOICES ?? "",
  ].join("\n");
  const byHost = cached.get(probe) ?? new Map();
  cached.set(probe, byHost);
  const hit = byHost.get(key);
  if (hit !== undefined && now - hit.at < cacheMs) return hit.found;
  const found = detectSpeech(probe, host);
  byHost.set(key, { at: now, found });
  return found;
}
