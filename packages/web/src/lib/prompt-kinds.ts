import type { PromptKind } from "@app/slices/library/model.js";
import { promptKinds } from "@app/slices/library/model.js";

export const kindOptions: readonly { readonly value: PromptKind; readonly label: string }[] =
  promptKinds.map((value) => ({ value, label: kindLabel(value) }));

export function kindLabel(kind: PromptKind): string {
  switch (kind) {
    case "article":
      return "Article";
    case "image":
      return "Image";
    case "thumbnail":
      return "Thumbnail";
    case "narration":
      return "Narration preparation";
    case "description":
      return "YouTube description";
    case "shorts":
      return "Shorts";
    case "review":
      return "Review";
    case "script":
      return "Script (speakers)";
    case "post":
      return "Post";
  }
}

// The kind inside a sentence: "New article prompt", "No YouTube description prompts yet".
export function kindNoun(kind: PromptKind): string {
  switch (kind) {
    case "description":
      return "YouTube description";
    case "narration":
      return "narration preparation";
    case "script":
      return "script";
    default:
      return kindLabel(kind).toLowerCase();
  }
}

// One sentence on what a prompt of the kind is for: "An image prompt describes the pictures
// shown during the video."
export function kindSentence(kind: PromptKind): string {
  const noun = kindNoun(kind);
  const about = kindAbout(kind);
  return `${/^[aeiou]/i.test(noun) ? "An" : "A"} ${noun} prompt ${about.charAt(0).toLowerCase()}${about.slice(1)}`;
}

// What a prompt of each kind makes, said once above its list and under its editor's text, so
// the kind's name never has to explain itself.
export function kindAbout(kind: PromptKind): string {
  switch (kind) {
    case "article":
      return "Writes the article the narrator reads.";
    case "image":
      return "Describes the pictures shown during the video.";
    case "thumbnail":
      return "Describes the video's thumbnail picture.";
    case "narration":
      return "Adds delivery cues, like a pause or a laugh, without changing the narrator's words.";
    case "description":
      return "Writes the YouTube description, chapters and tags.";
    case "shorts":
      return "Picks the moments cut into vertical shorts.";
    case "review":
      return "Tells the AI reviewer what to check in a finished stage, and when to make it again.";
    case "script":
      return "Writes a script for two or more voices, in place of an Article prompt.";
    case "post":
      return "Writes a post about the video for X, LinkedIn, Instagram, TikTok, Reddit or Bluesky.";
  }
}

// The empty text box's example, in the words a person would write for that kind.
export function kindPlaceholder(kind: PromptKind): string {
  switch (kind) {
    case "article":
      return "Tell the writer what to make and how. Put {{Topic}} where the video's subject goes.";
    case "script":
      return "Tell the writer who speaks and how. Put {{Topic}} where the video's subject goes.";
    case "image":
    case "thumbnail":
      return "Describe the picture: the subject, the style, the light. Put {{Topic}} where the video's subject goes.";
    case "narration":
      return "Tell the AI how the narration should sound: where to pause, what to stress.";
    case "description":
      return "Tell the writer what the description should say and how long it should be.";
    case "shorts":
      return "Tell the AI which moments make a good short.";
    case "review":
      return "Tell the reviewer what to check and when to send it back.";
    case "post":
      return "Tell the writer what the post should say and in what voice.";
  }
}

// An example name for a new prompt of the kind, as the Name field's placeholder.
export function kindNameExample(kind: PromptKind): string {
  switch (kind) {
    case "article":
      return "History documentary";
    case "image":
      return "Oil painting scenes";
    case "thumbnail":
      return "Bold title card";
    case "narration":
      return "Calm documentary delivery";
    case "description":
      return "Chapters and sources";
    case "shorts":
      return "Most surprising moments";
    case "review":
      return "Fact check";
    case "script":
      return "Two-host conversation";
    case "post":
      return "Short teaser";
  }
}

// A kind read off the URL. Anything else is someone's typing, and Article is the kind the
// screen opens on.
export function kindOf(value: unknown): PromptKind {
  return promptKinds.find((kind) => kind === value) ?? "article";
}
