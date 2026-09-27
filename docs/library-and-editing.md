# Library history, YouTube description edits and reading

## Library rows

Every row on **Library → Prompts** and **Library → Intros & Outros** shows its actions:
**Edit**, **Duplicate**, **Use in Play**, **History** and **Delete** (Delete asks first).
**Use in Play** picks the prompt or intro/outro in the open Play draft and opens Play on the
field that shows it: an article prompt switches the article to Generate, an image prompt is
ticked with one image, a thumbnail prompt switches the thumbnail to From prompt, and a
Description or Shorts prompt turns that step on. The rest of the draft stays as it was. While
Play is starting a run from its draft the button is off.

## Narration aliases

**Library → Aliases** lists words the narrator should say differently from how they are
written: `Dr.` as `Doctor`, `Ms.` as `Miss`, or any word or phrase and how to read it. Each
alias has **Whole word** (on: only where it stands as a word, not inside a longer one) and
**Match case** (off: `DR.` and `dr.` match too). Where two could apply, the longer written
form wins. **Save aliases** saves the whole list; a row it can't save is marked with the
reason.

Play's Audio Advanced and Edit project have **Use narration aliases** (on for new drafts; off,
and nothing copied, for projects from before aliases existed). A project copies the Library's
aliases when it starts; editing the Library never changes a started project until you press
**Update from Library** in Edit project. Aliases work with every generated voice.

Only what is spoken changes: the text sent to the voice and the sentences Narration
Preparation reads. The article, the narration text, the transcript and the captions keep the
written words, so a caption reads "Dr. Grey" while the audio says "Doctor Grey"; caption
timing matches each written word to its aliased speech. Where an alias and the Pronunciation
Glossary name the same word, the alias wins. A project's narration is rebuilt only where an
alias it uses appears in the text.

An alias whose written form has several words (`et al.`, `New York City`) is read with single
spaces around it: "Grey et al. wrote" goes to the voice as "Grey and others wrote", never with a
doubled space where the later words were. Multi-speaker runs apply aliases to each turn,
including turns sent together to ElevenLabs' Text to Dialogue.

## Prompt history

Every save of a prompt or intro/outro keeps a version (author "you", with its time); a save
that changed nothing adds none. **History** opens a drawer with:

- **Compare**: pick any two versions; they are shown side by side with the changed words
  marked (removed on the left, added on the right).
- **Versions**: **Restore** saves an old version again as a new version ("restored from
  version 2"), so nothing after it is lost. If another item has taken its name since, rename
  that one first.
- **Used by**: the templates, active or paused schedules (by the template version they run)
  and projects that name it, with how many of each project's revisions used it and whether
  the current one does.

Prompts and intros/outros saved before this existed start with their current text as
version 1. One restored from a backup or imported starts its history from its imported text.
Deleting a prompt deletes its history.

## Editing the YouTube description

On a project's Video section, under **YouTube**, the summary, chapters, hashtags and tags each
have **Edit**. A saved edit is marked **Your edit** and has **Use generated** to go back.

When the description is written again, fields you did not change follow the new text. A field
you changed keeps your text and shows **New generated version available** with **Use it**,
**Keep mine** and **View diff** instead of overwriting it.

### Chapters follow YouTube's rules

YouTube only turns a description's timestamps into chapters when the first is at 0:00, there
are at least three, each lasts at least 10 seconds and they go up in time; otherwise it ignores
the whole list. The written description already follows these rules, but a hand edit, or a
video cut again to another length, can break them. So the chapters are fitted whenever the
description is shown, copied, or handed to Prepare upload and the Studio extension:

1. chapters out of time order are put in order (of two at the same time, the first listed
   stays);
2. a chapter starting after the video ends is removed;
3. the first chapter moves to 0:00;
4. a chapter shorter than 10 seconds is merged into the one before it (the first chapter into
   the one after it, which then starts at 0:00), again until none is shorter;
5. with fewer than three chapters left, the chapter list is left out.

A note under the chapters says what changed, for example *Chapters adjusted for YouTube: moved
the first, "Intro", from 0:05 to 0:00; merged "Blink" (6 s) into "Intro".* Your edit and the
written file stay exactly as they were (so **Edit** starts from your own text, and nothing
becomes outdated); only what is shown and copied is fitted. Other lines you typed among the
chapters stay where they were. The last chapter's length is checked against the video's length
once the video is made.

## Channel links and placeholders

**Settings → Channel links** holds named links (Patreon, Discord, …). Write `{{Patreon}}` in a
description, or ask for it in a Description prompt, and it is replaced by that link when the
description is shown or copied; matching ignores case and extra spaces. A placeholder with no
link stays as typed, is highlighted, and the page says which link to add. Each project can set
its own **Previous video** under YouTube; it wins over a Settings link of the same name.

## Reading view

The article, its research notes and sources, and the narration text (Audio section) are shown
as a reading view: a ~70-character measure, a contents list from the headings, **Search** with
every hit marked (Enter / Shift+Enter or the arrows step through them), **Copy section** beside
each heading and Copy all as Markdown.

## Style preview

Edit project → **Subtitles** shows a **Style preview**: six seconds of video rendered by the
same renderer as the finished video, at a small size, with the project's format, caption font,
size and position, the Look, the transition and a chapter card (when chapter cards are on). It
renders when the section opens and again a moment after a setting changes; **Render again**
renders it from scratch. Captions show in the preview only when they are burned in, because a
caption file is drawn by the player in its own style. The pictures are three of the bundled
sample project's images (landscape or portrait by format) and the sound is six seconds of its
narration, with the word timing its alignment found (`assets/style-preview/`,
`slices/style-preview/narration.ts`), so the captions follow the voice word by word. A typed
Sample text other than the default is spread over the stretches the narration speaks. A
preview never calls a provider and costs nothing.

**Shorts preview**: Play's and Edit project's Shorts section shows one under **More shorts
options** while Shorts is on. It renders the same sample as a 9:16 short through the Shorts
renderer (`renderShort`, at preview size): the big word-by-word captions in the caption font,
the title as a headline when **Title on screen** is on (the sample's title), and the chosen
**Speed**. The request's `shorts: {titleOnScreen, speed?, title?}` picks this layout.

On Play the preview is drawn on a real picture when there is one, so the Look and captions are
judged on something like the video's own images: the establishing image the draft uploaded
(Images → Establishing image → Upload, or the one a template brings along), else a picture of
the channel's cast member the title or a keyword names, else the first cast member with a
picture. The rail says which ("Drawn on Tiamat's picture"). The server reads it from the
upload, the project output or the cast picture itself (`slices/style-preview/images.ts`); the
request can also name a project's own output, for Edit project. A picture the server can no
longer find, or a file that is not a PNG, JPEG or WebP, falls back to the sample's images.

Previews are saved in `<data-dir>/cache/style-preview/`, named by a hash of the settings, so a
style you have seen before plays at once; the 200 most recent are kept, and deleting the folder
is safe.

## Trash

Deleting a project, a Library prompt or intro/outro, a template or a schedule moves it to
**Settings → Trash** for 30 days instead of removing it. It disappears from every list,
picker, lookup, the calendar and the batch queue; its name is free for a new item at once.
Each row shows its kind, when it was deleted and the days left, with **Restore** and
**Delete now** (which asks first).

- **Restore** puts it back as it was. A prompt, intro/outro or template whose name a live item
  took meanwhile comes back as "Name (restored)", then "Name (restored 2)"…; a renamed template
  gets a new version.
- A **project** still running cannot be deleted (Cancel run first, as before). One waiting its
  turn (a queued batch item, a checkpoint) is held while in the trash, and picks up where it was
  when restored.
- A **template** used by a schedule that is not deleted cannot be deleted (as before). A
  **schedule** comes back **paused** with no next run; press Resume on Schedules to run it again.
  Its template must be restored first if it is in the trash too; if the template was removed for
  good the schedule cannot be restored. A deleted schedule's run history stays on Schedules.
- **Delete now**, and the daily purge of anything in the trash over 30 days, remove the item for
  good: a project's folder first, then its rows (a folder that will not go keeps it in the trash
  for the next try), a prompt or entry with its History.
