// One colour per speaker, by their place in the speaker list, for captions, the speaker panel
// and the script view. The same six values are the `--color-speaker-N` design tokens in
// `packages/web/src/styles/index.css`; a seventh speaker starts the list again.
export const speakerPalette = [
  "#f2c14e",
  "#6ec3f4",
  "#f28482",
  "#9bcb4f",
  "#c39bd3",
  "#f5a65b",
] as const;

export function speakerColour(index: number): string {
  return (
    speakerPalette[
      ((index % speakerPalette.length) + speakerPalette.length) % speakerPalette.length
    ] ?? "#ffffff"
  );
}

// ASS writes colours blue first: &HAABBGGRR in a style (alpha 00 is opaque) and &HBBGGRR& in
// an inline override.
export function assColour(hex: string, alpha = 0): string {
  return `&H${alpha.toString(16).padStart(2, "0")}${bgr(hex)}`.toUpperCase();
}
export function assInlineColour(hex: string): string {
  return `&H${bgr(hex)}&`.toUpperCase();
}
function bgr(hex: string): string {
  const value = hex.replace("#", "");
  return `${value.slice(4, 6)}${value.slice(2, 4)}${value.slice(0, 2)}`;
}

// What the caption writers need to know about the speakers of a multi-voice run.
export interface SpeakerStyle {
  readonly name: string;
  readonly colour: string;
}
export interface CaptionSpeakers {
  readonly styles: Readonly<Record<string, SpeakerStyle>>;
  readonly nameTags: boolean;
}
