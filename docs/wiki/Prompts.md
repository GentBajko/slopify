# Prompts

Prompts are the instructions Slopify gives your models: how to write the article, what each picture shows, what the thumbnail looks like, how to write the YouTube description, which moments become shorts, and more. You write a prompt once, with `{{keywords}}` where the subject goes, and Create turns each keyword into a field you fill in per video.

**Where to find it:** **Prompts**. Pick the kind with **Prompt kind** at the top.

## Prompt kinds

The kind decides where Create offers the prompt.

| Kind | What it does | What it costs |
|---|---|---|
| **Article** | The instruction the text model gets to write the video's article, which becomes the narration. Research notes go first when research ran. The answer's sources and pronunciation sections are never narrated. | One call on the project's LLM, plus up to 3 more when the answer runs out of room |
| **Image** | Sent as written to the image model, with the keywords filled in. No text model rewrites it. Create sets how many pictures each prompt makes (1 to 20, at most 60 a run). Pictures show for 15 s each by default and repeat until the video ends. | One image call per picture |
| **Thumbnail** | Describes the thumbnail. With Thumbnail set to **Prompt by LLM**, the text model first turns it into a picture prompt using the title and article. 1 thumbnail by default, or 3: the second a close-up, the third a wider shot. | One image call per thumbnail, plus one text call with Prompt by LLM |
| **Narration Preparation** | Tells the text model how the narration should be delivered. It only adds cues, such as a short speaking direction or a laugh or sigh, and never rewrites the words. Works with the Inworld TTS-2 voice model. | One call each for the body, the intro and the outro |
| **YouTube Description** | Tells the text model how to write the description, chapters, hashtags and tags from the timestamped transcript. A project that picks none uses the built-in wording. | One call per video |
| **Shorts** | Tells the text model which moments to cut into vertical shorts (3 of 60 to 120 s by default). A project that picks none uses the built-in wording. | One call to pick them, one per short for its picture prompts, one image call per picture |
| **Review** | Tells the reviewer what to check in a finished article, set of images, narration, thumbnail or shorts, and when to flag or redo it. Pictures can only be judged by the Claude Code and Codex reviewers. A stage with none picked uses its own built-in wording. | One reviewer call per item checked |
| **Script (speakers)** | Used instead of an Article prompt when a run has several voices. The text model answers with `#` section headings and `Name: words` turns, one speaker per paragraph. Text in `[square brackets]` is not spoken. | One call on the project's LLM |
| **Post** | Writes a project's post for X, LinkedIn, Instagram, TikTok, Reddit or Bluesky from the article. Slopify gives it the site's length limit and asks again when the answer is over it, then adds the hashtags and the link itself. Picked per site in a template's Upload pack (text **Written by a post prompt**); a site set to a post prompt with none picked uses the built-in wording. See [Posting to social sites](Posting-to-Social-Sites#post-prompts). | One call per site that uses it, on the project's LLM |

See [Create: Article](Create-Article), [Create: Images](Create-Images), [Create: Narration](Create-Narration), [YouTube description](YouTube-Description), [Shorts](Shorts), [Reviews and checkpoints](Reviews-and-Checkpoints), [Multiple voices](Multiple-Voices) and [Posting to social sites](Posting-to-Social-Sites) for how each is used.

## Write a new prompt

1. Open **Prompts** and pick the **Prompt kind**.
2. Press **New prompt**.
3. Type a **Name**: up to 200 characters, unique within its kind. Create and a project's Edit settings list the prompt by this name.
4. Write the **Body**, up to 100,000 characters. Put a keyword in double braces wherever the subject goes, for example:

   ```
   Write a 1,500-word documentary narration about {{Topic}} for a general audience.
   Open with a question. End with one surprising fact.
   ```

5. Watch **Detected slots** (the keyword list) fill in as you type.
6. For an Image prompt that draws photo-like pictures, see [Mark an image prompt as photorealistic](#mark-an-image-prompt-as-photorealistic).
7. Press **Save** (or `Ctrl+S`). A tick shows when it is saved.

If **Save** won't go, the sentence beside it names the first problem, such as "Enter a name." or a keyword that is never closed.

### Start from ready-made text

Some kinds have a starter button above the body:

- **Narration Preparation:** **Use Documentary Starter** fills in documentary delivery cues.
- **YouTube Description**, **Shorts** and **Post:** **Use Built-in Starter** fills in the wording Slopify uses when no prompt is picked.

When the body already has text, Slopify asks "Replace this prompt body?" first. Nothing is saved until you press **Save**.

## Keywords (slots)

Every `{{keyword}}` in the body becomes one field on Create, except the two Slopify fills itself (below).

- You type a keyword's value once per video, and it is filled into every prompt, intro and outro that names it.
- Names are case-sensitive: `{{Topic}}` and `{{topic}}` are two fields.
- A keyword the project title also names (for example a title of `History: {{Topic}}`) is typed per video, and templates save it empty.
- A prompt with no keywords runs as written.

Mistakes the editor refuses, with the line and column:

- a `{{` that is never closed ("Add `}}` after the keyword name"),
- a keyword with no name,
- a keyword placed inside another keyword.

### Keywords Slopify fills

Keywords written with the `Slopify_` prefix, like `{{Slopify_Title}}`, `{{Slopify_Summary}}` or `{{Slopify_Setting}}`, never become fields either: Slopify fills them itself, and the editor's **Insert** bar lists the ones each kind of prompt can use. See [Keywords Slopify fills](Keywords-Slopify-Fills) for every one, where it works and what it costs. Any other name starting with `Slopify_` is refused when you save.

`{{Scene}}` and `{{Appearance}}` are the old names of `{{Slopify_Scene}}` and `{{Slopify_Appearance}}`. They never become fields. The project's AI model writes them during the run, once the article exists, and the picture waits for them:

| Keyword | Filled with | Works in | Needs |
| --- | --- | --- | --- |
| `{{Scene}}` | This picture's moment from the article: for images, in order from the article's opening to its ending; for thumbnails, its most striking moment, a different one for each of three. | Image and thumbnail prompts | Images → **Scenes from the article** on |
| `{{Appearance}}` | How the figures look, looked up on the web (most iconic depiction): the ones the picture's scene names, or the video's subject; a thumbnail or a short always gets the subject. | Image, thumbnail, establishing and shorts image prompts | Nothing: the keyword turns it on |

Put each on a line of its own with a label, for example:

```
Scene: {{Scene}}

Looks: {{Appearance}}
```

- An image prompt without `{{Scene}}` still gets its scene, after its first paragraph, while Scenes from the article is on. A thumbnail prompt without it gets none.
- With Scenes from the article off, a line holding `{{Scene}}` is left out. A `{{Appearance}}` line whose scene names no one is left out too.
- Each costs one more AI call per video (the looks call searches the web).
- In the shorts' image prompt (**Shorts → Image prompt**), `{{Appearance}}` gives each short the subject's look and those of the figures its clip names. A `{{Scene}}` line is left out there: each short's images already show what is said at that moment.

See [Create: Images](Create-Images#scenes-from-the-article) for how the scenes and looks are chosen.

## Mark an image prompt as photorealistic

YouTube asks whether a video contains realistic-looking AI scenes. Slopify answers for you from your marks.

1. Save the Image prompt first. (Before it is saved, the editor says "Save this Image prompt first, then choose whether it draws photorealistic pictures.")
2. Turn on **Draws photorealistic pictures** when the prompt's style looks like real photos or film. Leave it off for painterly or illustrated styles.

It applies at once, without pressing Save. Copy for YouTube Studio then answers Yes to YouTube's AI use question for videos and shorts drawn with this prompt. A channel set to **Always Yes** or **Always No** wins. Default: off. See [Publishing to YouTube](Publishing-to-YouTube).

## Edit, duplicate, use and delete

Each prompt's row has, in order:

| Action | What it does |
|---|---|
| **Edit** | Opens the editor. Change the text and press **Save**. |
| **Duplicate** | Opens the editor with a copy. Give it a new name and save. |
| **Make a video** | Picks the prompt in your open draft and opens Create on its field. An article prompt switches the article to **Write it for me**, an image prompt is ticked, a thumbnail prompt turns the thumbnail on with **From my thumbnail prompt**, a Description or Shorts prompt turns that extra on, and a Post prompt writes every site's post that is on (X's, when none is). |
| **History** | Opens the prompt's history (below). |
| **Delete** | Asks first, then moves the prompt to **Settings → Backup & storage → Trash** for 30 days, where **Restore** brings it back. |

Use **Search prompts** (`/`) to find one by name. A press anywhere on a row picks it.

### Rename a prompt

Press the pencil (**Rename <name>**) beside the name, type the new name and press **Save name** or Enter. `Esc` or **Cancel** keeps the old one. The text stays as it is, the rename is one version in **History**, and the notice ("Renamed “A” to “B”.") has **Undo**.

## What happens when you edit a prompt

Projects keep their own copy of every prompt they used. Editing a prompt here changes only runs started later. Templates remember a prompt by name and use its current text. Renaming a prompt renames it in every version of every template, so a template, and a schedule running an older version marked ready, keeps using it. A template uses the copy saved with it only once the prompt is deleted.

To bring a new prompt version into an existing project, open the project's **Edit project**, and on the prompt press **Use the Library version** (or pick it again). What was made from the old wording turns outdated, and nothing is remade until you choose. See [Editing a project](Editing-a-Project).

## Used by

The panel beside the list shows what uses the selected prompt:

- **Templates** that name it,
- **Schedules** (active or paused) by the template version they run,
- **Projects**, with how many of their revisions used it and whether the current one does.

It matches by name within the kind. If nothing uses it, it says "Nothing uses it yet."

## History and versions

Every save that changes the name or text adds a version, and every version is kept. A save that changed nothing adds none.

1. Press **History** on the prompt's row (the clock icon).
2. The drawer shows the latest change with the changed words marked.

**Compare:** pick any two versions under **Older** and **Newer**. They are shown side by side, with removed words marked on the left and added words on the right. A rename between them is said above the text.

**Versions:** every saved version, newest first. **Restore** saves an older version again as a new version ("restored from version 2"), so nothing after it is lost. If another prompt has taken its name since, rename that one first. Projects already made keep their text.

Prompts saved before history existed start with their current text as version 1. A prompt imported from a backup starts its history from its imported text, unless the backup carried its history.

## Tips

- Keep one keyword for the subject (`{{Topic}}`) and put it in the video title too. Then templates and schedules work without extra setup.
- Ask the article prompt for a Pronunciation Glossary of names in IPA if you use Inworld voices. See [Aliases and glossary](Narration-Aliases-and-Glossary).
- Write image prompts as the picture itself ("A candle-lit scriptorium, oil painting, warm light"), not as an instruction to a person. No text model rewrites them.
- Use **Duplicate** before a big change, or rely on **History** and **Restore**.

## Related pages

- [Prompts and Templates](Prompts-and-Templates)
- [Create: Article](Create-Article)
- [Create: Images](Create-Images)
- [Keywords Slopify fills](Keywords-Slopify-Fills)
- [Templates](Templates)
- [Editing a project](Editing-a-Project)
- [Trash](Trash)
