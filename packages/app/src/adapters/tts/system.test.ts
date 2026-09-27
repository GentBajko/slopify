import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isProviderError } from "../../kernel/ports/model.js";
import type { DetectedSpeech } from "../../kernel/ports/system-speech.js";
import type { CliRun, RunCli } from "../llm/run-cli.js";
import { systemTts } from "./system.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const espeak: DetectedSpeech = {
  engines: [
    {
      id: "espeak-ng",
      name: "eSpeak NG",
      voices: [
        { id: "en-us", name: "English (America)", language: "en-us" },
        { id: "fr-fr", name: "French", language: "fr-fr" },
      ],
    },
  ],
};

interface Call {
  readonly binary: string;
  readonly args: readonly string[];
  readonly text?: string;
  readonly env?: NodeJS.ProcessEnv | undefined;
}

// Stands in for the speech program and ffmpeg: each writes the file its arguments name.
function fakeRun(calls: Call[], fail?: { binary: string; stderr: string }): RunCli {
  return (binary, args, _signal, options) => {
    const textFile = args[args.indexOf("-f") + 1];
    calls.push({
      binary,
      args,
      ...(args.includes("-f") && textFile !== undefined
        ? { text: readFileSync(textFile, "utf8") }
        : {}),
      env: options?.env,
    });
    const failed = fail?.binary === binary;
    if (!failed) {
      const out =
        binary === "ffmpeg"
          ? args.at(-1)
          : args.includes("-w")
            ? args[args.indexOf("-w") + 1]
            : options?.env?.SLOPIFY_SPEECH_OUT;
      if (out !== undefined) writeFileSync(out, binary === "ffmpeg" ? "MP3 BYTES" : "RIFF");
    }
    const run: CliRun = {
      pid: 1,
      stdout: (async function* () {})(),
      stderr: () => (failed ? (fail?.stderr ?? "") : ""),
      ended: Promise.resolve({ code: failed ? 1 : 0, error: null }),
      kill: () => undefined,
    };
    return run;
  };
}

function adapter(
  calls: Call[],
  detected: DetectedSpeech = espeak,
  fail?: { binary: string; stderr: string },
) {
  const tempRoot = mkdtempSync(join(tmpdir(), "system-tts-test-"));
  roots.push(tempRoot);
  return {
    tempRoot,
    port: systemTts({
      detect: async () => detected,
      run: fakeRun(calls, fail),
      ffmpeg: "ffmpeg",
      tempRoot,
      env: { PATH: "/usr/bin" },
    }),
  };
}

async function text(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

describe("the system voice", () => {
  it("lists the speech programs found as its models, and costs no key", async () => {
    const { port } = adapter([]);
    expect(port.id).toBe("system-voice");
    expect(await port.models()).toEqual([{ id: "espeak-ng", name: "eSpeak NG" }]);
    expect(await port.voiceLanguages?.("fr-fr", AbortSignal.timeout(1000))).toEqual(["fr"]);
  });

  it("speaks the text through a file, converts it to mp3 and leaves nothing behind", async () => {
    const calls: Call[] = [];
    const { port, tempRoot } = adapter(calls);
    const spoken = await port.synthesize({
      model: "espeak-ng",
      voiceId: "en-us",
      text: "-v is not a flag here",
      signal: AbortSignal.timeout(5000),
    });
    expect(spoken.container).toBe("mp3");
    expect(await text(spoken.audio)).toBe("MP3 BYTES");
    expect(calls[0]).toMatchObject({ binary: "espeak-ng", text: "-v is not a flag here" });
    expect(calls[0]?.args.slice(0, 2)).toEqual(["-v", "en-us"]);
    expect(calls[1]?.binary).toBe("ffmpeg");
    expect(calls[1]?.args).toContain("libmp3lame");
    expect(readdirSync(tempRoot)).toEqual([]);
  });

  it("uses the program's English voice when asked for the default", async () => {
    const calls: Call[] = [];
    const { port } = adapter(calls);
    await port.synthesize({ voiceId: "default", text: "Hi", signal: AbortSignal.timeout(5000) });
    expect(calls[0]?.args.slice(0, 2)).toEqual(["-v", "en-us"]);
  });

  it("hands Windows its inputs in variables, never inside the script", async () => {
    const calls: Call[] = [];
    const { port } = adapter(calls, {
      engines: [
        {
          id: "sapi",
          name: "Windows voices",
          voices: [{ id: "Microsoft Zira Desktop", name: "Zira", language: "en-US" }],
        },
      ],
    });
    await port
      .synthesize({
        voiceId: "Microsoft Zira Desktop",
        text: "'; Remove-Item C:\\ -Recurse; '",
        signal: AbortSignal.timeout(5000),
      })
      .catch(() => undefined);
    expect(calls[0]?.binary).toBe("powershell");
    expect(calls[0]?.args.join(" ")).not.toContain("Remove-Item");
    expect(calls[0]?.env).toMatchObject({
      PATH: "/usr/bin",
      SLOPIFY_SPEECH_VOICE: "Microsoft Zira Desktop",
    });
  });

  it("names the voice and the screen when the voice isn't installed", async () => {
    const { port } = adapter([]);
    const failure = await port
      .synthesize({ voiceId: "klingon", text: "Hi", signal: AbortSignal.timeout(5000) })
      .catch((error: unknown) => error);
    expect(isProviderError(failure) && failure.fault.kind).toBe("unsupported");
    expect(String(failure)).toMatch(/"klingon".*Settings → Voices/);
  });

  it("says what the program said when it fails, and what to do", async () => {
    const { port } = adapter([], espeak, { binary: "espeak-ng", stderr: "voice file missing" });
    const failure = await port
      .synthesize({ voiceId: "en-us", text: "Hi", signal: AbortSignal.timeout(5000) })
      .catch((error: unknown) => error);
    expect(String(failure)).toMatch(/eSpeak NG.*voice file missing.*Settings → Voices/);
  });

  it("refuses with the fix when no speech program exists", async () => {
    const { port } = adapter([], { engines: [], issue: "Install espeak-ng, or add a key." });
    const failure = await port
      .synthesize({ voiceId: "en-us", text: "Hi", signal: AbortSignal.timeout(5000) })
      .catch((error: unknown) => error);
    expect(String(failure)).toContain("Install espeak-ng, or add a key.");
  });
});
