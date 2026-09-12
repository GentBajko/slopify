import type { Output } from "@/api";

const labels: Readonly<Record<Output["role"], string>> = {
  notes: "Research notes",
  article_md: "Article (Markdown)",
  article_txt: "Article text",
  sources: "Research sources",
  glossary: "Glossary",
  audio_body: "Narration",
  audio_intro: "Intro narration",
  audio_outro: "Outro narration",
  audio_export: "Audio export",
  image: "Image",
  thumbnail: "Thumbnail",
  video: "Video",
  render_params: "Export settings",
  subtitles_srt: "Subtitles (SRT)",
  subtitles_vtt: "Subtitles (VTT)",
  subtitle_words: "Subtitle timing",
  subtitle_ass: "Styled subtitles",
  subtitle_font: "Subtitle font",
  instructions: "Generation instructions",
};
export function outputLabel(output: Output): string {
  return output.role === "image" && typeof output.meta.index === "number"
    ? `Image ${output.meta.index}`
    : labels[output.role];
}
