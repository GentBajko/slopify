import type { HelpEntry } from "../entry.js";

// The project page, Edit settings and the video, caption and upload screens it opens.
export const projectHelp = {
  // Video edit: cuts and the Look (video/edit-controls.tsx), shared by Play and Edit settings.
  "project.video.cuts": {
    title: "Cuts",
    body: "Every N seconds holds each image for Seconds per image. Follow the narration cuts in the pause after a sentence, as close to that length as the sentences allow (never under 40% of it), and starts a new image at every chapter. It needs word timing, so it works in English and the languages that have it. New projects default to Follow the narration.",
    tutorial: { page: "Video-Editing", anchor: "cuts" },
  },
  "project.video.chapter-cards": {
    title: "Chapter cards",
    body: "Shows each chapter's title in the middle of the picture for 2.5 seconds as the chapter starts, in the caption font. Chapters come from the YouTube description when that step runs, otherwise from the article's headings. Needs narration. Default: off.",
    tutorial: { page: "Video-Editing", anchor: "the-look" },
  },
  "project.video.animate": {
    title: "Animate images",
    body: "Turns some images into 5-second moving clips with an image-to-video model on your image service (fal.ai or Replicate). Chapter openers animates the first image of each chapter; Every Nth image animates every 2nd to 10th. Each clip is one paid call, shown in the estimate. An image that cannot be animated stays still. Default: Off.",
    tutorial: { page: "Video-Editing", anchor: "the-look" },
  },
  "project.pause.sentence": {
    title: "Pause between sentences",
    body: "The least quiet after each sentence, in seconds. Some voices barely breathe between sentences; this adds silence where the pause is shorter, never shortening one or cutting a word, and the captions follow. About 0.25 s is brisk, 0.35 to 0.45 natural or documentary, 0.5 to 0.8 an audiobook's relaxed pace, 0.8 and up sleep content. Default: 0.4; 0 keeps the voice's own.",
    tutorial: { page: "Editing-a-Project", anchor: "pauses-and-volume" },
  },
  "project.pause.paragraph": {
    title: "Pause between paragraphs",
    body: "The least quiet at the end of a paragraph, in seconds, when you want more than between sentences. Usually the narration prompt and the voice pace paragraphs well already, so it is 0 by default: paragraphs get the sentence pause. Try 0.8 to 1.2 for a slower read. A speaker's turn gap is set under Speakers instead. Runs on this computer.",
    tutorial: { page: "Editing-a-Project", anchor: "pauses-and-volume" },
  },
  "project.remove-breaths": {
    title: "Soften breaths",
    body: "Turns the audible in-breaths between sentences and after commas down by 12 dB, with soft fades. A breath with any word sound in it is left as it is, and every word, pause and caption stays where it was. Runs on this computer, no API calls; turning it on joins the narration again from its pieces, never makes the speech again. Default: off.",
    tutorial: { page: "Editing-a-Project", anchor: "pauses-and-volume" },
  },
  "project.soften-s": {
    title: "Soften S sounds",
    body: "Puts each narration piece through a very light de-esser, which takes the sharp edge off s and sh sounds while the voice keeps its brightness. Works with or without Soften breaths. Runs on this computer, no API calls; turning it on joins the narration again from the pieces it already has, never makes the speech again. Default: off.",
    tutorial: { page: "Editing-a-Project", anchor: "pauses-and-volume" },
  },
  "project.level-sentences": {
    title: "Level each sentence",
    body: "Holds each sentence to the sentences in the minute around it, so no line jumps out or drops away: loud ones come down by up to 6 dB, quiet ones up by up to 3 dB, and the volume only changes in the pauses. Runs before Soften breaths and Soften S sounds. Needs Level the volume and one voice. Joins the narration again, never makes the speech again. Default: off.",
    tutorial: { page: "Editing-a-Project", anchor: "pauses-and-volume" },
  },
  "project.loudness": {
    title: "Level the volume",
    body: "Brings every narration piece (each chunk, and each speaker's turn) to one loudness before they are joined, so the voice stops jumping between quiet and loud. Then the video, the shorts and the audio files are each set to a finished loudness. Runs on this computer, no API calls; turning it on makes the levelled narration and the exports again, never the speech. Default: on for new runs.",
    tutorial: { page: "Editing-a-Project", anchor: "pauses-and-volume" },
  },
  "project.loudness.video": {
    title: "Video volume",
    body: "How loud the finished video and shorts are, in dB from the recommended level. LUFS is how loud a file sounds on average (the scale YouTube and Spotify use); YouTube and Spotify play everything at about -14 LUFS, so 0 dB here is -14 LUFS. -6 dB is about half as loud (50%), +4 dB about 158%. Peaks always stay under -1.5 dBTP.",
    tutorial: { page: "Editing-a-Project", anchor: "pauses-and-volume" },
  },
  "project.loudness.audio-files": {
    title: "Audio files volume",
    body: "How loud the audio-only WAV and an audiobook's MP3 and M4B are, in dB from -18 LUFS, the level audiobook shops such as ACX ask for (-18 to -23 LUFS). LUFS is how loud a file sounds on average. Type dB or a percentage of the recommended level; peaks always stay under -3 dBTP, which those shops require.",
    tutorial: { page: "Editing-a-Project", anchor: "pauses-and-volume" },
  },
  "project.ambient.source": {
    title: "Ambient sound",
    body: "Rain, a fireplace or wind made on this computer, or your own audio file, played quietly under the whole narration of the long video. It dips while the narrator speaks. Costs no API calls. Shorts never get it. Changing it makes only the video again. Default: None, or the channel's bed.",
    tutorial: { page: "Video-Editing", anchor: "ambient-sound" },
  },
  "project.ambient.level": {
    title: "Ambient level",
    body: "How loud the ambient sound plays under the voice, in decibels from -40 (barely there) to -6 (close to the voice). Whole numbers only. Default: -18 dB.",
    tutorial: { page: "Video-Editing", anchor: "ambient-sound" },
  },
  "project.ambient.fade-in": {
    title: "Ambient fade in",
    body: "How many seconds the ambient sound takes to rise from silence at the start of the video, 0 to 30 in half-second steps. Default: 3 seconds.",
    tutorial: { page: "Video-Editing", anchor: "ambient-sound" },
  },
  "project.ambient.tail": {
    title: "Ambient tail",
    body: "How long the ambient sound keeps playing, fading out, after the narration ends: 0 to 30 seconds in half-second steps. A tail longer than the silence at the end makes the video that much longer. Default: 6 seconds.",
    tutorial: { page: "Video-Editing", anchor: "ambient-sound" },
  },
  "project.subtitles.mode": {
    title: "Captions",
    body: "Off makes none. Show captions in the video draws them into the picture and also makes .srt and .vtt files; it needs a video. Caption files only gives you the files to upload beside the video. Captions are timed from your narration on this computer, with no paid API; the first use downloads a speech model of about 378 MB (Settings → Production defaults offers smaller ones). Default: Off.",
    tutorial: { page: "Video-Editing", anchor: "subtitles" },
  },
  "project.subtitles.font": {
    title: "Caption font",
    body: "The typeface of captions shown in the video and of chapter cards. Pick a bundled font or one you uploaded (.ttf or .otf); uploaded fonts stay available to every project. Caption files carry no font, since players style them. Changing it makes only the video again. Default: the bundled font.",
    tutorial: { page: "Video-Editing", anchor: "subtitles" },
  },
  "project.edit.article-text": {
    title: "Article text",
    body: "The script the narrator reads, in Markdown. Your edits are kept when other settings change and are saved as a new version; the narration, images and video made from the old text turn outdated and are made again when you choose. Headings become chapters.",
    tutorial: { page: "Editing-a-Project", anchor: "change-the-article-text" },
  },
  "project.prompts.template": {
    title: "Use a saved prompt",
    body: "Copies one of your saved prompts into this project, replacing the raw prompt below. The project keeps its own copy, so later edits to the saved prompt reach it only when you pick it again or press Use the new wording. What was made from the old wording turns outdated; nothing is made again until you choose.",
    tutorial: { page: "Editing-a-Project", anchor: "prompts" },
  },
  "project.prompts.raw": {
    title: "Raw prompt",
    body: "This project's own copy of the prompt, with keywords still in double braces such as {{Topic}}. Edit it to change what the model is asked for this project only; your saved prompt is untouched. Saving fills the keywords in again, and what was made from the old wording turns outdated.",
    tutorial: { page: "Editing-a-Project", anchor: "prompts" },
  },
  "project.shorts.range": {
    title: "Clip range",
    body: "The first and last sentence of this short, from the narration's timed sentences. The clip must stay between the shortest and longest length you set for shorts and must not overlap another clip; the line under the clip says what to change. Back to the AI's choice restores its pick.",
    tutorial: { page: "Shorts", anchor: "change-the-picked-moments" },
  },
  "project.images.prompt": {
    title: "Image prompt",
    body: "The words this one image is drawn from, with keywords in double braces filled in from the project. Editing it outdates only this image and the video; it is drawn again, one image call, when you make the outdated images again. Use saved wording as template copies the prompt as sent so you can edit it.",
    tutorial: { page: "Editing-a-Project", anchor: "edit-images" },
  },
  "project.narration.chunk-text": {
    title: "Narration chunk text",
    body: "What the narrator says in this chunk. Editing it has this chunk spoken again by your voice service, paid per character of the chunk, when you make the outdated narration again; the other chunks keep their audio. Captions and the video follow. It does not change the article.",
    tutorial: { page: "Editing-a-Project", anchor: "edit-narration" },
  },
  "project.rebuild.keep-provided": {
    title: "Keep the provided content",
    body: "This output uses a file or text you supplied, and something it depends on, such as the narration, has changed since. Tick to confirm it still fits and keep it as it is. To use something else, cancel and replace the file in Edit settings first. The button that makes it again stays off until you tick it.",
    tutorial: { page: "Editing-a-Project", anchor: "choose-what-to-remake" },
  },
  "project.rebuild.unknown-costs": {
    title: "Unknown cost estimates",
    body: "Some steps use a model with no published price, so their cost cannot be estimated and is left out of the total shown. Tick to start anyway; the real cost is recorded under Cost once they run. The button that makes it again stays off until you tick it.",
    tutorial: { page: "Editing-a-Project", anchor: "choose-what-to-remake" },
  },
  "project.edit.show-figures": {
    title: "Show tables and figures on screen",
    body: "Shows each described table, figure, equation and code block in the video while its description is spoken, as the article's picture or a card drawn on this computer at no cost. Turning it on or off renders the video again, and any Shorts that include a card; the narration is kept. The cards appear under Images, From the article, and can be made again there.",
    tutorial: { page: "Play-Outputs", anchor: "show-tables-and-figures-on-screen" },
  },
  "project.edit.describe-figures": {
    title: "Describe tables and figures",
    body: "The text model writes a short spoken passage for each table, figure, equation and code block, said in its place. Turning it on costs one text-model call per block, and after you save, the narration chunks that contain a block are spoken again, paid per character (the whole narration when Chunking is the whole article). Other chunks keep their audio; captions and timing are redone to match.",
    tutorial: { page: "Play-Narration", anchor: "tables-figures-and-code" },
  },
} as const satisfies Readonly<Record<string, HelpEntry>>;
