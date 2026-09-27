import { defaultEdgeSilenceSeconds } from "../admission/rules.js";
import { type PlayDraftDocument, playDraftDocumentSchema } from "../play-drafts/schema.js";
import type { PackPromptKey, StarterPack } from "./packs.js";

// A pack's Play template: its prompts ticked, its voice picked, its style set, and the text and
// image providers left for the user to choose, since which of them is installed or keyed
// differs per machine.
export function packTemplate(
  pack: StarterPack,
  names: Readonly<Partial<Record<PackPromptKey, string>>>,
  voiceId: string,
): PlayDraftDocument {
  const { style } = pack;
  const name = (key: PackPromptKey): string => names[key] ?? "";
  return playDraftDocumentSchema.parse({
    schemaVersion: 1,
    form: {
      title: "",
      format: "16:9",
      sources: {
        research: style.research ? "generate" : "off",
        article: "generate",
        audio: "generate",
        images: "generate",
        thumbnail: name("thumbnail") === "" ? "off" : "from_prompt",
        video: "generate",
        document: "off",
      },
      llm: { provider: "", model: "" },
      audio: {
        provider: pack.voice.provider,
        model: pack.voice.model,
        voice: voiceId,
        usePronunciationGlossary: true,
        shareGlossary: true,
      },
      images: { provider: "", model: "" },
      articlePrompt: name("article"),
      narrationPrompt: "",
      youtubeDescription: name("description") !== "",
      descriptionPrompt: name("description"),
      shorts: {
        enabled: name("shorts") !== "",
        count: "2",
        minSeconds: "45",
        maxSeconds: "90",
        prompt: name("shorts"),
        imagePrompt: name("image"),
        titleOnScreen: true,
      },
      imagePrompts:
        name("image") === "" ? [] : [{ name: name("image"), number: String(style.imagesPerVideo) }],
      thumbnailPrompt: name("thumbnail"),
      intro: "",
      outro: "",
      chunking: { mode: "whole", words: "500", characters: "3000" },
      subtitles: {
        mode: "burn-in",
        language: "en",
        fontId: "default",
        fontSize: String(style.captions.fontSize),
        position: style.captions.position,
      },
      imageSeconds: String(style.imageSeconds),
      edgeSilenceSeconds: String(defaultEdgeSilenceSeconds),
      zoomPercent: String(style.zoomPercent),
      motionStyle: style.motionStyle,
      videoEdit: style.videoEdit,
      values: {},
      provided: { research: "", article: "", audio: null, images: [], thumbnail: null },
    },
    section: "content",
    variants: [],
    expectedWords: String(style.expectedWords),
    previewText: "Every story begins with a word.",
    fontUpload: null,
  });
}
