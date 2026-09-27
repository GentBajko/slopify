# Prompts

Prompts are the instructions Slopify gives your models: how to write the article, what each picture shows, what the thumbnail looks like, how to write the YouTube description, which moments become shorts, and more. You write a prompt once, with `{{keywords}}` where the subject goes, and Play turns each keyword into a field you fill in per video.

**Where to find it:** **Library → Prompts**. Pick the kind with **Prompt kind** at the top.

## Prompt kinds

The kind decides where Play offers the prompt.

| Kind | What it does | What it costs |
|---|---|---|
| **Article** | The instruction the text model gets to write the video's article, which becomes the narration. Research notes go first when research ran. The answer's sources and pronunciation sections are never narrated. | One call on the project's LLM, plus up to 3 more when the answer runs out of room |
| **Image** | Sent as written to the image model, with the keywords filled in. No text model rewrites it. Play sets how many pictures each prompt makes (1 to 20, at most 60 a run). Pictures show for 15 s each by default and repeat until the video ends. | One image call per picture |
| **Thumbnail** | Describes the thumbnail. With Thumbnail set to **Prompt by LLM**, the text model first turns it into a picture prompt using the title and article. 1 thumbnail by default, or 3: the second a close-up, the third a wider shot. | One image call per thumbnail, plus one text call with Prompt by LLM |
| **Narration Preparation** | Tells the text model how the narration should be delivered. It only adds cues, such as a short speaking direction or a laugh or sigh, and never rewrites the words. Works with the Inworld TTS-2 voice model. | One call each for the body, the intro and the outro |
| **YouTube Description** | Tells the text model how to write the description, chapters, hashtags and tags from the timestamped transcript. A project that picks none uses the built-in wording. | One call per video |
| **Shorts** | Tells the text model which moments to cut into vertical shorts (3 of 60 to 120 s by default). A project that picks none uses the built-in wording. | One call to pick them, one per short for its picture prompts, one image call per picture |
| **Review** | Tells the reviewer what to check in a finished article, set of images, narration, thumbnail or shorts, and when to flag or redo it. Pictures can only be judged by the Claude Code and Codex reviewers. A stage with none picked uses its own built-in wording. | One reviewer call per item checked |
| **Script (speakers)** | Used instead of an Article prompt when a run has several voices. The text model answers with `#` section headings and `Name: words` turns, one speaker per paragraph. Text in `[square brackets]` is not spoken. | One call on the project's LLM |

See [Title and article](Play-Title-and-Article), [Images](Play-Images), [Narration](Play-Narration), [YouTube description](YouTube-Description), [Shorts](Shorts), [Reviews and checkpoints](Reviews-and-Checkpoints) and [Multiple voices](Multiple-Voices) for how each is used.

## Write a new prompt

1. Open **Library → Prompts** and pick the **Prompt kind**.
2. Press **New prompt**.
3. Type a **Name**: up to 200 characters, unique within its kind. Play and Edit project list the prompt by this name.
4. Write the **Body**, up to 100,000 characters. Put a keyword in double braces wherever the subject goes, for example:

   ```
   Write a 1,500-word documentary narration about {{Topic}} for a general audience.
   Open with a question. End with one surprising fact.
   ```

5. Watch **Detected slots** (the keyword list) fill in as you type.
6. For an Image prompt that draws photo-like pictures, see [Mark an image prompt as photorealistic](#mark-an-image-prompt-as-photorealistic).
7. Press **Save**. A tick shows when it is saved.

If **Save** won't go, the sentence beside it names the first problem, such as "Enter a name." or a keyword that is never closed.

### Start from ready-made text

Some kinds have a starter button above the body:

- **Narration Preparation:** **Use Documentary Starter** fills in documentary delivery cues.
- **YouTube Description** and **Shorts:** **Use Built-in Starter** fills in the wording Slopify uses when no prompt is picked.

When the body already has text, Slopify asks "Replace this prompt body?" first. Nothing is saved until you press **Save**.

## Keywords (slots)

Every `{{keyword}}` in the body becomes one field on Play.

- You type a keyword's value once per video, and it is filled into every prompt, intro and outro that names it.
- Names are case-sensitive: `{{Topic}}` and `{{topic}}` are two fields.
- A keyword the project title also names (for example a title of `History: {{Topic}}`) is typed per video, and templates save it empty.
- A prompt with no keywords runs as written.

Mistakes the editor refuses, with the line and column:

- a `{{` that is never closed ("Add `}}` after the keyword name"),
- a keyword with no name,
- a keyword placed inside another keyword.

## Mark an image prompt as photorealistic

YouTube asks whether a video contains realistic-looking AI scenes. Slopify answers for you from your marks.

1. Save the Image prompt first. (Before it is saved, the editor says "Save this Image prompt first, then choose whether it draws photorealistic pictures.")
2. Turn on **Draws photorealistic pictures** when the prompt's style looks like real photos or film. Leave it off for painterly or illustrated styles.

It applies at once, without pressing Save. Prepare upload then answers Yes to YouTube's AI use question for videos and shorts drawn with this prompt. A channel set to **Always Yes** or **Always No** wins. Default: off. See [Publishing to YouTube](Publishing-to-YouTube).

## Edit, duplicate, use and delete

Each prompt's row has, in order:

| Action | What it does |
|---|---|
| **Edit** | Opens the editor. Change the text and press **Save**. |
| **Duplicate** | Opens the editor with a copy. Give it a new name and save. |
| **Use in Play** | Picks the prompt in your open Play draft and opens Play on its field. An article prompt switches the article to Generate, an image prompt is ticked with one image, a thumbnail prompt switches the thumbnail to From prompt, and a Description or Shorts prompt turns that step on. |
| **History** | Opens the prompt's history (below). |
| **Delete** | Asks first, then moves the prompt to **Settings → Trash** for 30 days, where **Restore** brings it back. |

Use **Search prompts** to find one by name.

## What happens when you edit a prompt

Projects keep their own copy of every prompt they used. Editing a prompt here changes only runs started later. Templates keep their own copy too, and remember a prompt by name: after a rename they use the copy saved with them until you pick the prompt again.

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

- [Library overview](Library-Overview)
- [Title and article](Play-Title-and-Article)
- [Images](Play-Images)
- [Templates](Templates)
- [Editing a project](Editing-a-Project)
- [Trash](Trash)
