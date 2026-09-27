# Library history, YouTube description edits and reading

## Library rows

Every row on **Library → Prompts** and **Library → Intros & Outros** shows its actions:
**Edit**, **Duplicate**, **Use in Play**, **History** and **Delete** (Delete asks first).
**Use in Play** picks the prompt or intro/outro in the open Play draft and opens Play on the
field that shows it: an article prompt switches the article to Generate, an image prompt is
ticked with one image, a thumbnail prompt switches the thumbnail to From prompt, and a
Description or Shorts prompt turns that step on. The rest of the draft stays as it was. While
Play is starting a run from its draft the button is off.

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
caption file is drawn by the player in its own style. The pictures are three stills and the
sound is silence, all made by ffmpeg on your computer, so a preview never calls a provider and
costs nothing.

Previews are saved in `<data-dir>/cache/style-preview/`, named by a hash of the settings, so a
style you have seen before plays at once; the 200 most recent are kept, and deleting the folder
is safe.
