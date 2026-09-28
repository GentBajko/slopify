import type { Output } from "@app/slices/storage/model.js";
import type { StageFile } from "./parts";

const segments = [
  { segment: "intro", name: "Intro" },
  { segment: "body", name: "Body" },
  { segment: "outro", name: "Outro" },
] as const;

// "(.mp3)" from the saved file's name, so the menu says what each file is.
export function extensionOf(output: Output): string {
  const match = /\.([a-z0-9]+)$/i.exec(output.path);
  return match === null ? "" : ` (.${(match[1] ?? "").toLowerCase()})`;
}

// Every narration file in one Download menu, grouped by segment: the recording, then the
// clean narration (the spoken text the captions use), then the TTS script (with its delivery
// cues). One list and one Open folder for the stage, never a folder button per file.
// `speakers` is a multi-voice run's speaker split (the text model's lines by speaker, the
// Article stage's `script_md`), downloadable here too as the text the narration was read from.
export function narrationFiles(
  outputs: readonly Output[],
  audio: readonly { readonly segment: string; readonly output: Output }[] = [],
  speakers?: Output,
): readonly StageFile[] {
  return [
    ...segmentFiles(outputs, audio),
    ...(speakers === undefined
      ? []
      : [{ output: speakers, label: `Script by speaker${extensionOf(speakers)}` }]),
  ];
}

function segmentFiles(
  outputs: readonly Output[],
  audio: readonly { readonly segment: string; readonly output: Output }[],
): readonly StageFile[] {
  return segments.flatMap(({ segment, name }) => {
    const text = (role: "narration_txt" | "tts_script") =>
      outputs.find((output) => output.role === role && output.meta.segment === segment);
    const recorded = audio.find((one) => one.segment === segment)?.output;
    const clean = text("narration_txt");
    const script = text("tts_script");
    return [
      ...(recorded === undefined
        ? []
        : [{ output: recorded, label: `${name} narration${extensionOf(recorded)}` }]),
      ...(clean === undefined
        ? []
        : [{ output: clean, label: `${name} clean narration${extensionOf(clean)}` }]),
      ...(script === undefined
        ? []
        : [{ output: script, label: `${name} TTS script${extensionOf(script)}` }]),
    ];
  });
}

// What the text files are, said once beside the Voice and Chunking facts.
export function hasNarrationText(outputs: readonly Output[]): boolean {
  return outputs.some((output) => output.role === "narration_txt" || output.role === "tts_script");
}
