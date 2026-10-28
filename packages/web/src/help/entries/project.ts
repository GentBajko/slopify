import type { HelpEntry } from "../entry.js";

// The project page, Edit settings and the video, caption and upload screens it opens.
export const projectHelp = {
  // Video edit: cuts and the Look (video/edit-controls.tsx), shared by Play and Edit settings.
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
  "project.loudness": {
    title: "Level the volume",
    body: "Brings every narration piece (each chunk, and each speaker's turn) to one loudness before they are joined, so the voice stops jumping between quiet and loud. Then the video, the shorts and the audio files are each set to a finished loudness. Runs on this computer, no API calls; turning it on makes the levelled narration and the exports again, never the speech. Default: on for new runs.",
    tutorial: { page: "Editing-a-Project", anchor: "pauses-and-volume" },
  },
  "project.edit.article-text": {
    title: "Article text",
    body: "The script the narrator reads, in Markdown. Your edits are kept when other settings change and are saved as a new version; the narration, images and video made from the old text turn outdated and are made again when you choose. Headings become chapters.",
    tutorial: { page: "Editing-a-Project", anchor: "change-the-article-text" },
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
    tutorial: { page: "Editing-a-Project", anchor: "choose-what-to-make-again" },
  },
  "project.rebuild.unknown-costs": {
    title: "Unknown cost estimates",
    body: "Some steps use a model with no published price, so their cost cannot be estimated and is left out of the total shown. Tick to start anyway; the real cost is recorded under Cost once they run. The button that makes it again stays off until you tick it.",
    tutorial: { page: "Editing-a-Project", anchor: "choose-what-to-make-again" },
  },
  "project.edit.show-figures": {
    title: "Show tables and figures on screen",
    body: "Shows each described table, figure, equation and code block in the video while its description is spoken, as the article's picture or a card drawn on this computer at no cost. Turning it on or off makes the video again, and any Shorts that include a card; the narration is kept. The cards appear under Images, From the article, and can be made again there.",
    tutorial: { page: "Create-Narration", anchor: "tables-figures-and-code" },
  },
  "project.edit.describe-figures": {
    title: "Describe tables and figures",
    body: "The AI writer writes a short spoken passage for each table, figure, equation and code block, said in its place. Turning it on costs one AI call per block, and after you save, the narration pieces that contain a block are spoken again, paid per character (the whole narration when it is read as one piece). Other pieces keep their audio; captions and timing are redone to match.",
    tutorial: { page: "Create-Narration", anchor: "tables-figures-and-code" },
  },
} as const satisfies Readonly<Record<string, HelpEntry>>;
