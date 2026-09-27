import type { HelpEntry } from "../entry.js";

// The project page, Edit project and the video, caption and upload screens it opens.
export const projectHelp = {
  // Video edit: cuts and the Look (video/edit-controls.tsx), shared by Play and Edit project.
  "project.video.cuts": {
    title: "Cuts",
    body: "Every N seconds holds each image for Seconds per image. Follow the narration cuts in the pause after a sentence, as close to that length as the sentences allow (never under 40% of it), and starts a new image at every chapter. It needs word timing, so it works in English and the languages that have it. New projects default to Follow the narration.",
  },
  "project.video.transition": {
    title: "Transition",
    body: "How one image hands over to the next: Cut, Crossfade, Fade through black, Slide or Wipe. The change is centred on the cut and takes the length you pick (0.2 to 2 s), so the video stays exactly as long as its narration. Default: Cut, 0.6 s.",
  },
  "project.video.grade": {
    title: "Colour grade",
    body: "A colour treatment over the whole video: Warm fantasy, Cold, Desaturated or Sepia. It is applied while the video renders, so it costs no API calls, only render time. Default: None.",
  },
  "project.video.vignette": {
    title: "Vignette",
    body: "Darkens the corners of the picture to draw the eye to the middle. Subtle or Strong. Applied while the video renders, with no API cost. Default: Off.",
  },
  "project.video.grain": {
    title: "Film grain",
    body: "Adds moving film grain over the whole picture for an older, filmic feel. Subtle or Strong. Applied while the video renders, with no API cost. Default: Off.",
  },
  "project.video.atmosphere": {
    title: "Atmosphere",
    body: "An overlay Slopify draws itself: rising embers, drifting dust, or low fog along the bottom of the frame. No footage is downloaded and no API is called; it only adds render time. Default: None.",
  },
  "project.video.chapter-cards": {
    title: "Chapter cards",
    body: "Shows each chapter's title in the middle of the picture for 2.5 seconds as the chapter starts, in the caption font. Chapters come from the YouTube description when that step runs, otherwise from the article's headings. Needs narration. Default: off.",
  },
  "project.video.animate": {
    title: "Animate images",
    body: "Turns some images into 5-second moving clips with an image-to-video model on your image provider (fal.ai or Replicate). Chapter openers animates the first image of each chapter; Every Nth image animates every 2nd to 10th. Each clip is one paid call, shown in the estimate. An image that cannot be animated stays still. Default: Off.",
  },
  "project.ambient.source": {
    title: "Ambient sound",
    body: "Rain, a fireplace or wind made on this computer, or your own audio file, played quietly under the whole narration of the long video. It dips while the narrator speaks. Costs no API calls. Shorts never get it. Changing it remakes only the video. Default: None, or the channel's bed.",
  },
  "project.ambient.level": {
    title: "Ambient level",
    body: "How loud the ambient sound plays under the voice, in decibels from -40 (barely there) to -6 (close to the voice). Whole numbers only. Default: -18 dB.",
  },
  "project.ambient.fade-in": {
    title: "Ambient fade in",
    body: "How many seconds the ambient sound takes to rise from silence at the start of the video, 0 to 30 in half-second steps. Default: 3 seconds.",
  },
  "project.ambient.tail": {
    title: "Ambient tail",
    body: "How long the ambient sound keeps playing, fading out, after the narration ends: 0 to 30 seconds in half-second steps. A tail longer than the silence at the end makes the video that much longer. Default: 6 seconds.",
  },
  "project.subtitles.mode": {
    title: "Subtitles",
    body: "Off makes none. Subtitle files gives you .srt and .vtt files to upload beside the video. Burn into video draws the captions into the picture and also makes the files; it needs Video on. Captions are timed from your narration on this computer, with no paid API; the first use downloads a speech model of about 95 MB. Default: Off.",
  },
  "project.subtitles.font": {
    title: "Subtitle font",
    body: "The typeface of burned-in captions and chapter cards. Pick a bundled font or one you uploaded (.ttf or .otf); uploaded fonts stay available to every project. Subtitle files carry no font, since players style them. Changing it remakes only the video. Default: the bundled font.",
  },
  "project.subtitles.size": {
    title: "Subtitle font size",
    body: "How big burned-in captions are, from 16 to 120. Larger is easier to read on phones but covers more of the picture. Default: 48.",
  },
  "project.subtitles.position": {
    title: "Subtitle position",
    body: "Where burned-in captions sit on the frame: Top, Upper-middle, Center, Lower-middle or Bottom. Move them up when the pictures have important detail near the bottom. Subtitle files ignore it. Default: Bottom.",
  },
  "project.video.style-preview": {
    title: "Style preview",
    body: "Six seconds rendered on this computer by the real video renderer, with your captions, Look and motion on the establishing image or a cast picture. It renders again by itself a moment after you change a setting. It costs no API calls, only a few seconds of your computer's time. Render again forces a fresh one.",
  },
  "project.edit.article-text": {
    title: "Article text",
    body: "The script the narrator reads, in Markdown. Your edits are kept when other settings change and are saved as a new revision; the narration, images and video made from the old text turn outdated and are remade when you choose. Headings become chapters.",
  },
  "project.edit.regenerate-article": {
    title: "Regenerate article after review",
    body: "Marks the article to be written again by the text model, which is one or more paid text calls. Nothing runs yet: the rebuild review lists it with the narration, images and video it outdates, and you start it there. It replaces any edits you made to the article.",
  },
  "project.saved-revision": {
    title: "Saved revision",
    body: "Every save of Edit project is a revision: a snapshot of the settings and content. Continuing a run always uses the current one. Saving never starts work; outputs the change affects turn outdated and keep their old version until remade. Remaking is offered as the next action, and History lets you go back.",
  },
  "project.choose-remake": {
    title: "Choose what to remake",
    body: "Opens the rebuild review for every outdated or failed output: what will be made again, kept or skipped, what it costs, and which inputs changed. Nothing runs until you press Remake there, and Keep things as they are closes it with nothing spent.",
  },
  "project.prompts.template": {
    title: "Use saved template",
    body: "Copies a prompt from your Library into this project, replacing the raw prompt below. The project keeps its own copy, so later Library edits reach it only when you pick it again or press Use the Library version. Outputs made from the old wording turn outdated; nothing is remade until you choose.",
  },
  "project.prompts.raw": {
    title: "Raw prompt",
    body: "This project's own copy of the prompt, with keywords still in double braces such as {{Topic}}. Edit it to change what the model is asked for this project only; the Library prompt is untouched. Saving fills the keywords in again, and what was made from the old wording turns outdated.",
  },
  "project.edit.rewrite-description": {
    title: "Write the description again",
    body: "Marks the YouTube description to be written again by the text model, one paid text call. Nothing runs yet: save, and it is remade when you continue the run or start the rebuild review. The description you have now is replaced.",
  },
  "project.shorts.clips": {
    title: "Picked clips",
    body: "The moments the text model picked for your shorts, each shown by its first and last sentence. Earlier and Later move a clip's start or end by one sentence; Use my own range picks both from lists. Moving a clip costs no calls and keeps its images where the sentences stay the same. Changes apply when you save and continue the run.",
  },
  "project.shorts.range": {
    title: "Clip range",
    body: "The first and last sentence of this short, from the narration's timed sentences. The clip must stay between the shortest and longest length you set for shorts and must not overlap another clip; the line under the clip says what to change. Back to the AI's choice restores its pick.",
  },
  "project.shorts.pick-again": {
    title: "Pick different moments",
    body: "Asks the text model to pick new moments when you save and continue the run, one text call. Ranges you set by hand are dropped. A new clip on the same sentences as an old one keeps its images; any other clip gets new images, one image call each, and is rendered again.",
  },
  "project.shorts.remake": {
    title: "Make this short again",
    body: "Makes this one short again when you save and continue the run: its image prompts are written again, its images are drawn again (one image call each) and it is rendered again. Its moment, title and the other shorts stay as they are.",
  },
  "project.images.editor": {
    title: "Edit images",
    body: "Every image of the video in the order it is shown. You can edit a drawn image's prompt, replace any image with your own file, move it earlier or later, delete it, or add a drawn image, your own picture or a video clip. A clip plays muted in an image's place, trimmed, slowed or looped to fit. Changes apply after you save.",
  },
  "project.images.prompt": {
    title: "Image prompt",
    body: "The words this one image is drawn from, with keywords in double braces filled in from the project. Editing it outdates only this image and the video; it is drawn again, one image call, when you remake outdated outputs. Use saved wording as template copies the prompt as sent so you can edit it.",
  },
  "project.images.regenerate": {
    title: "Regenerate image after review",
    body: "Marks this image to be drawn again from its prompt, one paid image call, with a new result. Nothing runs yet: save, and the rebuild review lists it with the video it outdates. The current image stays until the new one is made.",
  },
  "project.narration.editor": {
    title: "Edit narration",
    body: "The narration split into the chunks it was spoken in. Edit a chunk's text, replace its audio with your own file, or have it spoken again. Only the chunks you touch are made again, paid per character, and the video is rendered again with them. Changes apply after you save.",
  },
  "project.narration.chunk-text": {
    title: "Narration chunk text",
    body: "What the narrator says in this chunk. Editing it has this chunk spoken again by your voice provider, paid per character of the chunk, when you remake outdated outputs; the other chunks keep their audio. Captions and the video follow. It does not change the article.",
  },
  "project.narration.regenerate": {
    title: "Regenerate narration chunk after review",
    body: "Marks this chunk to be spoken again with the same text and voice, paid per character of the chunk, for a new take when a word came out wrong. Nothing runs yet: save, and it is made again when you continue the run. The current audio stays until then.",
  },
  "project.captions.editor": {
    title: "Caption text and timing",
    body: "Each caption's words and when it shows, in seconds from the start of the narration. Fix a misheard word or move a caption a little earlier or later; captions must not overlap and must end after they start. Edits cost nothing and only the subtitle files and the video are made again. The narration is not changed.",
  },
  "project.captions.apply": {
    title: "Apply caption edits to draft",
    body: "Checks every caption (text present, times in order, inside the narration) and puts your edits into the project draft. Nothing is saved until you press Save changes, and the video is rendered again only when you remake outdated outputs.",
  },
  "project.youtube.summary": {
    title: "Summary",
    body: "The opening of the YouTube description, written by the text model from the article. Edit changes it in place and keeps your text as yours: when the description is written again, your summary stays and the new one waits beside it with Use it, Keep mine and View diff. Use generated goes back to the model's text.",
  },
  "project.youtube.chapters": {
    title: "Chapters",
    body: "Timestamped chapter lines at the narration's real times, which YouTube turns into chapters. YouTube needs the first at 0:00, at least three, each at least 10 seconds long. Edit changes them in place and your edit survives the next rewrite; Use generated goes back.",
  },
  "project.youtube.hashtags": {
    title: "Hashtags",
    body: "The hashtags at the end of the description; YouTube shows the first three above the title. Edit changes them in place and your edit survives the next rewrite, with the new ones offered beside it. Use generated goes back to the model's.",
  },
  "project.youtube.tags": {
    title: "Tags",
    body: "Search tags for YouTube's Tags field, which allows 500 characters in all, commas included. They are not shown to viewers. Edit changes them in place and your edit survives the next rewrite; Copy gives them comma-separated, ready to paste.",
  },
  "project.youtube.previous-video": {
    title: "Previous video for this project",
    body: "The link that {{Previous video}} fills in this project's description, ahead of the one in Settings, Channel links. Paste the video this one follows on from. It changes only what is shown and copied, with no text call. Save links keeps it.",
  },
  "project.live.writing": {
    title: "Live writing",
    body: "The text model's words as they arrive, so you can see the article or research taking shape. When a stage makes several calls, the list picks which one to watch. Follow output keeps the newest text in view; untick it to read back. Watching costs nothing extra; the full text is saved when the stage finishes.",
  },
  "project.checkpoints.choices": {
    title: "Checkpoint choices",
    body: "A checkpoint holds the run before a step so you can check and edit what came before it. Tick a step that has not started to add one; untick to remove it, and work already admitted for that step carries on when ready. Pausing the project still applies. Only generated steps can have one. Save checkpoints applies the change.",
  },
  "project.rebuild.keep-provided": {
    title: "Keep the provided content",
    body: "This output uses a file or text you supplied, and something it depends on, such as the narration, has changed since. Tick to confirm it still fits and keep it as it is. To use something else, cancel and replace the file in Edit project first. Remake stays off until you tick it.",
  },
  "project.rebuild.unknown-costs": {
    title: "Unknown cost estimates",
    body: "Some steps use a model with no published price, so their cost cannot be estimated and is left out of the total shown. Tick to start anyway; the real cost is recorded under Cost once they run. Remake stays off until you tick it.",
  },
  "project.cost.by-stage": {
    title: "Cost by stage",
    body: "What each stage of this project has cost so far, from every provider call it made, retries and remakes included, priced from the model catalogue when each call finished. Failed calls are not charged here, and taxes and included credits are not counted. Stage time is how long the stage ran.",
  },
  "project.cost.by-model": {
    title: "Cost by model",
    body: "The same spending split by provider and model. Cost is what you paid the provider. Calls through a signed-in command-line tool such as Claude Code or Codex cost $0 on your plan; Via API shows what the same work would cost through the provider's API, for comparison only.",
  },
  "project.upload.item": {
    title: "What to upload",
    body: "Switches the list between the long video and each short, since each is uploaded to YouTube on its own with its own title, description and tags. The ticks and the Fill in YouTube Studio button follow the one you pick.",
  },
  "project.upload.real-footage": {
    title: "Real footage",
    body: "Turn this on when the video clips you uploaded are filmed footage, not made by AI. The AI use answer then checks them: laying a Look atmosphere such as fog over real footage makes it Yes, while colour, vignette or grain count as minor edits and keep it No. It is saved with the project and changes nothing in the video.",
  },
  "project.upload.steps": {
    title: "Upload steps",
    body: "Everything YouTube Studio asks for, in the order it asks: file, title, description, thumbnail, playlist, audience, AI use and tags. Copy puts each value on the clipboard. The tick box beside each step is only a note to yourself, remembered in this browser; it changes nothing in the project.",
  },
  "project.upload.fill-studio": {
    title: "Fill in YouTube Studio",
    body: "Opens Studio's upload page and hands this item's details to the optional Slopify Studio browser extension (Settings, YouTube Studio). Drop the video file in and the extension fills in the rest. You check it and press Publish yourself; Slopify never uploads or publishes.",
  },
  "project.mark-uploaded": {
    title: "Mark uploaded",
    body: "Records that you uploaded this finished video to YouTube yourself, so it leaves the ready-to-upload lists on Home and here and shows an Uploaded badge. Slopify does not upload anything or check YouTube. Undo takes the mark off.",
  },
  "project.edit.update-glossary": {
    title: "Update from other projects",
    body: "Copies your other projects' Pronunciation Glossary terms into this project again, picking up any added since the last copy. The project keeps its own copy, so nothing changes until you press this. After you save, only the narration chunks whose words those terms change are spoken again, paid per character.",
  },
  "project.edit.describe-figures": {
    title: "Describe tables and figures",
    body: "The text model writes a short spoken passage for each table, figure, equation and code block, said in its place. Turning it on costs one text-model call per block, and after you save, the narration chunks that contain a block are spoken again, paid per character (the whole narration when Chunking is the whole article). Other chunks keep their audio; captions and timing are redone to match.",
  },
  "project.edit.update-aliases": {
    title: "Update from Library",
    body: "Copies Library, Aliases into this project again, picking up aliases added or changed since the last copy. The project keeps its own copy, so a Library edit reaches it only when you press this. After you save, only the narration chunks the changed aliases touch are spoken again, paid per character.",
  },
} as const satisfies Readonly<Record<string, HelpEntry>>;
