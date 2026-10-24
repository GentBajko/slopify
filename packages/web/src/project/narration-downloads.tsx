import type { Output } from "@app/slices/storage/model.js";
import type { StageFile } from "./parts";

type Segment = "intro" | "body" | "outro";

const segments: readonly Segment[] = ["intro", "body", "outro"];

// What each part of a narration is called where there are several; one part is just "the
// narration".
export const segmentNames: Readonly<Record<Segment, string>> = {
  intro: "Intro",
  body: "Main part",
  outro: "Outro",
};

// "(.mp3)" from the saved file's name, so a menu says what each file is.
export function extensionOf(output: Output): string {
  const match = /\.([a-z0-9]+)$/i.exec(output.path);
  return match === null ? "" : ` (.${(match[1] ?? "").toLowerCase()})`;
}

// The recordings, one per part: "Narration (.mp3)", or "Intro (.mp3)", "Main part (.mp3)" and
// "Outro (.mp3)" for a narration in parts.
export function narrationAudioFiles(
  audio: readonly { readonly segment: string; readonly output: Output }[],
): readonly StageFile[] {
  return segments.flatMap((segment) => {
    const recorded = audio.find((one) => one.segment === segment)?.output;
    if (recorded === undefined) return [];
    const name = audio.length === 1 ? "Narration" : segmentNames[segment];
    return [{ output: recorded, label: `${name}${extensionOf(recorded)}` }];
  });
}

// The narration's text files, grouped by part: the spoken text (what the captions use), then
// the script sent to the voice (with its delivery cues). `speakers` is a multi-voice run's
// speaker split (the Article stage's `script_md`), the text the narration was read from.
export function narrationTextFiles(
  outputs: readonly Output[],
  speakers?: Output,
): readonly StageFile[] {
  const parts = segments.filter((segment) =>
    outputs.some(
      (output) =>
        (output.role === "narration_txt" || output.role === "tts_script") &&
        output.meta.segment === segment,
    ),
  );
  return [
    ...parts.flatMap((segment) => {
      const text = (role: "narration_txt" | "tts_script") =>
        outputs.find((output) => output.role === role && output.meta.segment === segment);
      const spoken = text("narration_txt");
      const script = text("tts_script");
      const of = parts.length === 1 ? "" : `, ${segmentNames[segment].toLowerCase()}`;
      return [
        ...(spoken === undefined
          ? []
          : [{ output: spoken, label: `Spoken text${of}${extensionOf(spoken)}` }]),
        ...(script === undefined
          ? []
          : [{ output: script, label: `Script sent to the voice${of}${extensionOf(script)}` }]),
      ];
    }),
    ...(speakers === undefined
      ? []
      : [{ output: speakers, label: `Script by speaker${extensionOf(speakers)}` }]),
  ];
}
