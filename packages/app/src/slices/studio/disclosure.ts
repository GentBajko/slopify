// YouTube's "Altered or synthetic content" question, answered for every video and short of a
// project. Browser-safe: the upload pack carries the answer, the channel page names the setting.
//
// The rule, as YouTube states it (read 2026-09-27):
// - https://support.google.com/youtube/answer/14328491 ("Disclosing use of altered or synthetic
//   content"): creators must disclose when they use AI "to meaningfully alter or generate
//   photorealistic content": a real person appearing to say or do what they didn't, altered
//   footage of real events or places, or realistic scenes that never happened. Clearly
//   unrealistic content (fantasy, animation), minor edits (colour, filters, upscaling, audio
//   repair) and production help (AI for the outline, script, thumbnail, title, infographic or
//   captions) need no disclosure; nor does cloning one's own voice for voice-overs. In Studio
//   it is a Yes/No question on the upload's details (that page now calls it "AI use" under
//   Attributes; the 2024 announcement called it "Altered content").
// - https://blog.youtube/news-and-events/disclosing-ai-generated-content/ (2024-03-18) lists
//   "synthetically generating a person's voice to narrate a video" among the uses that need it.
//
// What Slopify applies, erring on the side of Yes, since YouTube says disclosing limits neither
// a video's audience nor its eligibility to earn money:
// - Yes when an AI voice narrates (the Audio stage generates it by text-to-speech, one voice or
//   several), since a synthetic voice narrating is the blog's own example;
// - Yes when the images are AI-generated (the Images stage generates them, or images are
//   animated by an image-to-video model), since an image model can draw realistic scenes and
//   Slopify can't tell a photorealistic style from a cartoon one;
// - Yes for every short, whose images are always drawn anew by the image model;
// - No only when the narration is the user's own recording (or there is none) and the images
//   are the user's own (or there are none): nothing on screen or on the soundtrack is synthetic.
//   The article being written by a text model is script help, which needs no disclosure, and so
//   is an AI-made thumbnail.
// A channel whose videos are clearly unrealistic (cartoon images, and a voice that isn't posing
// as a real person) can set Always No; one that wants the label regardless can set Always Yes
// (Channels → the channel → Brand → YouTube AI disclosure).

export const aiDisclosureSettings = ["auto", "yes", "no"] as const;
export type AiDisclosureSetting = (typeof aiDisclosureSettings)[number];

export const aiDisclosureLabels: Readonly<Record<AiDisclosureSetting, string>> = {
  auto: "Automatic",
  yes: "Always Yes",
  no: "Always No",
};

export interface AiDisclosure {
  // Studio's answer: true is "Yes".
  readonly altered: boolean;
  // Why, in one plain sentence.
  readonly why: string;
}

// What the answer is worked out from: the project's sources as its config holds them.
export interface DisclosureInput {
  readonly setting: AiDisclosureSetting;
  readonly kind: "video" | "short";
  // The Audio stage's source: "generate" is an AI voice.
  readonly audio: string;
  // The Images stage's source: "generate" is an image model.
  readonly images: string;
  // Images animated by an image-to-video model (Edit project → Video → Animate images).
  readonly animated: boolean;
}

const where = "Channels → the channel → Brand → YouTube AI disclosure";

export function aiDisclosureOf(input: DisclosureInput): AiDisclosure {
  if (input.setting === "yes")
    return { altered: true, why: `This channel is set to Always Yes (${where}).` };
  if (input.setting === "no")
    return { altered: false, why: `This channel is set to Always No (${where}).` };
  const made: string[] = [];
  if (input.audio === "generate") made.push("an AI voice narrates it");
  if (input.kind === "short" || input.images === "generate")
    made.push("its images are drawn by an AI image model");
  if (input.kind === "video" && input.animated) made.push("some images are animated by AI");
  if (made.length > 0)
    return {
      altered: true,
      why: `Yes because ${list(made)}, and YouTube asks for this when AI makes a voice or a scene that could pass as real.`,
    };
  return {
    altered: false,
    why: "No because the narration and the images are your own, with no AI voice or AI images in the video.",
  };
}

function list(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1) ?? ""}`;
}
