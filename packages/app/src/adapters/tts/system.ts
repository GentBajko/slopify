import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ModelInfo } from "../../kernel/ports/model.js";
import { providerError } from "../../kernel/ports/model.js";
import {
  type DetectedSpeech,
  defaultSpeechVoice,
  noSpeechFix,
  primaryLanguage,
  type SpeechEngine,
  type SpeechVoice,
} from "../../kernel/ports/system-speech.js";
import type { TtsAudio, TtsPort, TtsRequest } from "../../kernel/ports/tts.js";
import type { RunCli } from "../llm/run-cli.js";

// The keyless voice: the speech program this computer already has (`kernel/system-speech.ts`
// finds it). Its "models" are the programs found, best first, and its voices are theirs. Each
// request writes the text to a private folder, has the program speak it into a WAV (AIFF on
// macOS) and turns that into the mp3 the port promises with the same ffmpeg the renderer uses.

export interface SystemTtsDeps {
  readonly detect: () => Promise<DetectedSpeech>;
  // The same child-process seam the agent CLIs use: an argument array, never a shell string.
  readonly run: RunCli;
  // The ffmpeg the app prepared at boot; undefined where none is wired (a test registry).
  readonly ffmpeg: string | undefined;
  // Where the per-request folder is made.
  readonly tempRoot: string;
  // What Windows' speech script is started with: it reads its inputs from variables.
  readonly env: Readonly<Record<string, string | undefined>>;
}

export const systemVoiceId = "system-voice";

// Windows speaks through System.Speech. Every input arrives in an environment variable, so no
// part of the text or the voice name is ever parsed as PowerShell.
export const windowsSpeakScript =
  "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; try { $s.SelectVoice($env:SLOPIFY_SPEECH_VOICE); $s.SetOutputToWaveFile($env:SLOPIFY_SPEECH_OUT); $s.Speak([System.IO.File]::ReadAllText($env:SLOPIFY_SPEECH_TEXT, [System.Text.Encoding]::UTF8)) } finally { $s.Dispose() }";

interface Command {
  readonly binary: string;
  readonly args: readonly string[];
  readonly stdin?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

// The program's command for one request. Text goes through a file (or stdin for Piper, an
// argument for Pico, which takes nothing else), so a line starting with "-" is never a flag.
export function speakCommand(
  engine: SpeechEngine,
  voice: SpeechVoice,
  files: { readonly text: string; readonly out: string },
  text: string,
  env: Readonly<Record<string, string | undefined>>,
): Command {
  switch (engine.id) {
    case "say":
      return { binary: "say", args: ["-v", voice.id, "-o", files.out, "-f", files.text] };
    case "sapi":
      return {
        binary: "powershell",
        args: ["-NoProfile", "-NonInteractive", "-Command", windowsSpeakScript],
        env: {
          ...env,
          SLOPIFY_SPEECH_VOICE: voice.id,
          SLOPIFY_SPEECH_OUT: files.out,
          SLOPIFY_SPEECH_TEXT: files.text,
        },
      };
    case "piper":
      return {
        binary: "piper",
        args: ["--model", voice.id, "--output_file", files.out],
        stdin: text,
      };
    case "pico2wave":
      return { binary: "pico2wave", args: ["-l", voice.id, "-w", files.out, "--", text] };
    case "espeak-ng":
    case "espeak":
      return { binary: engine.id, args: ["-v", voice.id, "-w", files.out, "-f", files.text] };
  }
}

export function systemTts(deps: SystemTtsDeps): TtsPort {
  const engineFor = async (model: string | undefined): Promise<SpeechEngine> => {
    const found = await deps.detect();
    const engine =
      model === undefined || model === ""
        ? found.engines[0]
        : found.engines.find((one) => one.id === model);
    if (engine !== undefined) return engine;
    throw providerError({
      kind: "unavailable",
      message:
        found.engines.length === 0
          ? (found.issue ?? `No speech program was found on this computer, ${noSpeechFix}`)
          : `The speech program "${model}" chosen for this narration isn't on this computer any more. In the Edit tab, choose Edit project and pick another System voice model (${found.engines.map((one) => one.name).join(", ")}) under Providers, then use Continue the run.`,
    });
  };

  return {
    id: systemVoiceId,
    capabilities: { streams: false },
    models: async (): Promise<readonly ModelInfo[]> =>
      (await deps.detect()).engines.map((engine) => ({ id: engine.id, name: engine.name })),
    voiceLanguages: async (voiceId) => {
      try {
        const found = await deps.detect();
        for (const engine of found.engines) {
          const voice = engine.voices.find((one) => one.id === voiceId);
          const language = voice === undefined ? undefined : primaryLanguage(voice);
          if (language !== undefined) return [language];
        }
      } catch {
        // Never throws: an unknown answer is undefined.
      }
      return undefined;
    },
    synthesize: async (req: TtsRequest): Promise<TtsAudio> => {
      const engine = await engineFor(req.model);
      const voice =
        engine.voices.find((one) => one.id === req.voiceId) ??
        (req.voiceId === "" || req.voiceId === "default" ? defaultSpeechVoice(engine) : undefined);
      if (voice === undefined)
        throw providerError({
          kind: "unsupported",
          message: `The system voice "${req.voiceId}" isn't installed for ${engine.name} on this computer. Pick one it has in Settings → Voices (Add voice, provider System voice), then choose it for this project and use Continue the run.`,
        });
      if (deps.ffmpeg === undefined)
        throw providerError({
          kind: "unavailable",
          message:
            "Slopify's ffmpeg isn't ready, so the system voice's recording can't be converted. Restart Slopify and try again.",
        });
      const dir = await mkdtemp(join(deps.tempRoot, "slopify-speech-"));
      try {
        const files = {
          text: join(dir, "text.txt"),
          out: join(dir, engine.id === "say" ? "speech.aiff" : "speech.wav"),
        };
        await writeFile(files.text, req.text, "utf8");
        await runToEnd(
          deps.run,
          speakCommand(engine, voice, files, req.text, deps.env),
          req.signal,
          engine.name,
        );
        const mp3 = join(dir, "speech.mp3");
        await runToEnd(
          deps.run,
          {
            binary: deps.ffmpeg,
            args: [
              "-hide_banner",
              "-loglevel",
              "error",
              "-y",
              "-i",
              files.out,
              "-codec:a",
              "libmp3lame",
              "-q:a",
              "4",
              mp3,
            ],
          },
          req.signal,
          "ffmpeg",
        );
        const bytes = new Uint8Array(await readFile(mp3));
        return { audio: streamOf(bytes), container: "mp3" };
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}

async function runToEnd(
  run: RunCli,
  command: Command,
  signal: AbortSignal,
  label: string,
): Promise<void> {
  const child = run(command.binary, command.args, signal, {
    ...(command.stdin === undefined ? {} : { stdin: command.stdin }),
    ...(command.env === undefined ? {} : { env: { ...command.env } }),
  });
  // Drained so a chatty program never blocks on a full pipe.
  for await (const _ of child.stdout) {
    // nothing to keep
  }
  const ended = await child.ended;
  signal.throwIfAborted();
  if (ended.error !== null || ended.code !== 0) {
    const said = child.stderr().trim().split(/\r?\n/).slice(-3).join(" ");
    throw providerError({
      kind: "other",
      message: `The system voice (${label}) couldn't make this narration${said === "" ? (ended.error === null ? "" : `: ${ended.error.message}`) : `: ${said}`}. Try another system voice in Settings → Voices, ${noSpeechFix}`,
    });
  }
}

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}
