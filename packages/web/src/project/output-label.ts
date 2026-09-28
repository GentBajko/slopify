import type { Output } from "@/api";

const labels: Readonly<Record<Output["role"], string>> = {
  notes: "Research notes",
  article_md: "Article (Markdown)",
  article_txt: "Article text",
  narration_txt: "Clean Narration",
  tts_script: "TTS Script",
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
  document_pdf: "Document (PDF)",
  youtube_description: "YouTube description",
  youtube_tags: "YouTube tags",
  youtube_pinned_comment: "Pinned comment",
  youtube_titles: "Other titles",
  shorts: "Shorts list",
  short_image: "Short image",
  short_video: "Short",
  animated_image: "Animated image",
  figure_card: "On-screen card",
  reference: "Establishing image (reference)",
  script_md: "Script (speaker split)",
  audio_mp3: "Audio (MP3 with chapters)",
  audio_m4b: "Audiobook (M4B with chapters)",
  audio_levelled: "Levelled narration",
};
export function outputLabel(output: Output): string {
  if ((output.role === "narration_txt" || output.role === "tts_script") && output.meta.segment)
    return `${output.meta.segment === "body" ? "Body" : output.meta.segment === "intro" ? "Intro" : "Outro"} ${labels[output.role]}`;
  if (output.role === "short_video" && typeof output.meta.short === "number")
    return `Short ${String(output.meta.short)}`;
  if (output.role === "short_image" && typeof output.meta.short === "number")
    return `Short ${String(output.meta.short)} image ${String(output.meta.index ?? 1)}`;
  if (output.role === "figure_card" && typeof output.meta.index === "number")
    return `On-screen card ${String(output.meta.index)}`;
  if (output.role === "animated_image" && typeof output.meta.index === "number")
    return `Animated image ${String(output.meta.index)}`;
  return output.role === "image" && typeof output.meta.index === "number"
    ? `Image ${output.meta.index}`
    : labels[output.role];
}

export function outputSlotLabel(slot: string): string {
  if (slot.startsWith("image:")) return "Image";
  if (slot.startsWith("animate:")) return labels.animated_image;
  if (/^shorts:\d+:render$/.test(slot)) return labels.short_video;
  if (/^shorts:\d+:image:\d+$/.test(slot)) return labels.short_image;
  if (slot === "document:pdf") return labels.document_pdf;
  const role = slot.split(":").at(-1);
  return Object.entries(labels).find(([key]) => key === role)?.[1] ?? "Saved output";
}
