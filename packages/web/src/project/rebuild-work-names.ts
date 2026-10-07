import type { RebuildPreview } from "@app/slices/rebuild/model.js";

// What a rebuild work key is called on screen: "Video export", "Image request 3".
const workNames: Readonly<Record<string, string>> = {
  "export:wav": "Audio export (WAV)",
  "export:video": "Video export",
  "subtitles:timing": "Subtitle timing",
  "subtitles:cues": "Caption text and timing",
  "subtitles:files": "Subtitle files",
  "article:body": "Article",
  "audio:provided": "Provided narration",
  "audio:body:concat": "Combined narration",
  "audio:intro": "Combined intro narration",
  "audio:outro": "Combined outro narration",
  "research:planner": "Research plan",
  "research:notes": "Research notes",
  "entry:intro:text": "Intro text",
  "entry:outro:text": "Outro text",
  "shorts:pick": "Shorts: pick the moments",
  "shorts:future": "Shorts: prompts, images and renders",
};
export function workName(key: string): string {
  const exact = workNames[key];
  if (exact !== undefined) return exact;
  // A short's own work, by its number: "Short 2: render", "Short 4: image 3".
  const short = /^shorts:(\d+):(prompts|render|image:(\d+))$/.exec(key);
  if (short !== null)
    return `Short ${short[1] ?? ""}: ${short[2] === "prompts" ? "image prompts" : short[2] === "render" ? "render" : `image ${short[3] ?? ""}`}`;
  const prefix = key.split(":")[0];
  const families: Readonly<Record<string, string>> = {
    image: "Image request",
    images: "Images",
    audio: "Narration request",
    article: "Article",
    research: "Research",
    thumbnail: "Thumbnail",
    subtitles: "Subtitles",
    video: "Video export",
    export: "Export",
    entry: "Intro or outro",
  };
  return families[prefix ?? ""] ?? "Output";
}
export function workLabels(preview: RebuildPreview): (key: string) => string {
  const labels = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const work of preview.work) {
    const name = workName(work.key);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const positions = new Map<string, number>();
  for (const work of preview.work) {
    const name = workName(work.key);
    const position = (positions.get(name) ?? 0) + 1;
    positions.set(name, position);
    labels.set(work.key, (counts.get(name) ?? 0) > 1 ? `${name} ${position}` : name);
  }
  for (const request of preview.review?.requests ?? []) labels.set(request.key, request.label);
  return (key) => labels.get(key) ?? workName(key);
}
