# YouTube Description

Slopify can write your video's YouTube description for you: a short summary, chapters at the narration's real times, hashtags, and a separate list of search tags. Each part has a Copy button and can be edited in place, and your edits survive when the description is written again.

**Where to find it:** Play → **Outputs** row → **YouTube description**. On a finished project: the **YouTube** section (Description and Tags), and Edit project → **Prompts**.

## What you get

| Part | What it is |
|---|---|
| **Summary** | The opening of the description, written from the article. |
| **Chapters** | Timestamped lines such as `0:00 Introduction`, at the narration's real times. YouTube turns them into chapters. |
| **Hashtags** | The hashtags at the end of the description. YouTube shows the first three above the title. |
| **Tags** | Search tags for YouTube Studio's **Tags** field, kept separate from the description. Viewers don't see them. |

Slopify lays out the description itself (summary, blank line, one chapter per line, blank line, hashtags), so the layout YouTube needs never depends on the model's spacing. The files are saved in the project as `description.txt` and `tags.txt`.

## Turn it on

1. On Play, open the **Outputs** row.
2. Tick **YouTube description**. It is greyed out, with "Needs narration", when the Narration row is off.
3. Pick a **Description prompt**, or leave it on **Built-in**.
4. Start the run.

The description is written after the video's subtitle timing, beside the render, in one text-model call. The project language decides the language it is written in; see [Other-Languages](Other-Languages).

## Options

| Option | What it does | Default |
|---|---|---|
| **YouTube description** | Writes the description, chapters, hashtags and tags after subtitle timing. One text-model call. Needs narration. | Off |
| **Description prompt** | The Library prompt the description is written from. | **Built-in** |

The **Built-in** prompt asks for:

- a 2-3 sentence summary that says what the viewer gets, without clickbait;
- 5 to 12 chapters for a long video (fewer for a short one), with titles of 2-6 words in title case;
- 3 to 5 hashtags, most specific last;
- 15 to 25 tags, from broad to specific.

To change the tone or add your own links, write a prompt of the kind **YouTube Description** in **Library → Prompts**. Each `{{keyword}}` in it becomes a field on Play. The prompt editor's starter button (see **Starter text** in its help) fills in the Built-in wording to start from. See [Prompts](Prompts).

## Read and copy it

When the step has run, the project page's **YouTube** section shows two parts. A finished project with a written description opens on this section, so copying it is one press:

- **Description**, with the Summary, Chapters and Hashtags, a character count such as `1,240 / 5000 characters`, and **Copy**.
- **Tags**, shown as chips, with a count against YouTube's 500-character limit and **Copy**.

**Copy** on Description copies the whole description, placeholders filled in. **Copy** on Tags copies them comma-separated, ready to paste. A count over YouTube's limit turns red and says "over YouTube's limit".

You can also run **Copy description** (`Shift+D`) and **Copy tags** from the command palette (`Ctrl+K`) while the project is open. The **YouTube description (.txt)** and **YouTube tags (.txt)** downloads are the text exactly as the page shows it: your edits, the fitted chapters and the filled links. See [Keyboard-Shortcuts-and-Command-Palette](Keyboard-Shortcuts-and-Command-Palette).

While the stage is running the parts say "Written after the subtitle timing."; before it starts they say "Not written yet. It is made with the video."

## Edit a part

1. In the project's YouTube section, press **Edit** beside Summary, Chapters, Hashtags or Tags.
2. Change the text and save.

Your text is now marked **Your edit**. It is kept as yours:

- When the description is written again, your part stays and "New generated version available." appears beside it with **Use it**, **Keep mine** and **View diff**.
- **Use generated** goes back to the model's text at any time.

Edits cost nothing and don't re-run anything.

## Chapters follow YouTube's rules

YouTube only turns a description's timestamps into chapters when the first is at 0:00, there are at least three, and each lasts at least 10 seconds. A hand edit, or a video cut to a new length after the description was written, can break those rules, so Slopify fits the chapters each time they are shown or copied:

1. Chapters out of order are put in time order; of two at the same time, the one listed first stays.
2. A chapter starting at or after the end of the video is removed.
3. The first chapter moves to 0:00.
4. A chapter shorter than 10 seconds is merged into the one before it (or, for the first, into the one after it).
5. With fewer than three chapters left, the chapter list is left out, since YouTube would ignore it.

When anything was changed, a note under the chapters starts with "Chapters adjusted for YouTube:" and lists what changed. Your stored text and your edit are never changed; only what is shown and copied is fitted.

## Links in the description

Write a name in double braces, such as `{{Patreon}}` or `{{Discord}}`, in a description, a hand edit, or in your Description prompt (asking the model to include it). When the description is shown or copied, it becomes the link of that name.

Each channel has its own links:

1. Open **Channels** → the project's channel → **Brand**.
2. Under **Channel links**, press **Add link**, type the name (for example `Patreon`) and the address, and press **Save channel**.

A description takes the links of its project's channel. Names match without regard to case or extra spaces. A placeholder with no saved link stays as typed, is marked, and the YouTube section says "No link is saved for {{Name}}, so it stays as typed. Add it under Channel links on the channel's Brand tab."

Links saved in **Settings → Channel links** before each channel had its own still fill the default channel's descriptions until you save that channel's Brand tab. See [Channels](Channels#channel-links).

### Previous video

`{{Previous video}}` is special: each project can have its own.

1. In the project's YouTube section, paste the link under **Previous video for this project**.
2. Press **Save links**.

The project's link wins over a **Previous video** link in the channel's links. It changes only what is shown and copied, with no text-model call.

Because placeholders are filled when shown or copied, changing a channel's link changes every description of that channel at once.

## Write it again, or turn it on later

1. Open the project and press **Edit project**.
2. Open **Prompts**. Tick **YouTube description** if it was off, and pick a **Description prompt**.
3. To replace a description that is already written, press **Write the description again after review**. **Keep the current description** cancels it.
4. Save, then continue the run or start the rebuild review.

Writing it again is one paid text-model call. The description you have now is replaced, except for parts you edited, which stay yours with the new text offered beside them.

## Limits

| Limit | Value |
|---|---|
| Description length (YouTube) | 5,000 characters |
| Tags field (YouTube) | 500 characters in all, commas included; 100 per tag |
| Hashtags | YouTube ignores every hashtag if a description has more than 15 |
| Chapters | At least 3, first at 0:00, each at least 10 seconds |

Slopify does not upload the description to YouTube. Paste it in YouTube Studio yourself, or use Prepare upload and the optional Studio extension; see [Publishing-to-YouTube](Publishing-to-YouTube).

## Related pages

- [Play-Outputs](Play-Outputs)
- [Prompts](Prompts)
- [Publishing-to-YouTube](Publishing-to-YouTube)
- [Studio-Extension](Studio-Extension)
- [Settings-Reference](Settings-Reference)
- [Editing-a-Project](Editing-a-Project)
- [Shorts](Shorts)
