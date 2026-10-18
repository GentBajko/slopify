# Keywords Slopify fills

Most `{{keywords}}` in a prompt are yours: each becomes a field on Play that you fill in once per video. The keywords on this page are different. Slopify fills them itself, so they never become fields, and each one is written with the `Slopify_` prefix, like `{{Slopify_Title}}` or `{{Slopify_Thumbnail_Text}}`.

The whole `Slopify_` prefix is Slopify's. `{{Title}}`, `{{Channel}}` and `{{Date}}` stay ordinary keywords of your own, so no prompt you already have changes meaning.

In the prompt editor, the **Insert** bar above the text lists the keywords the prompt's kind can use; click one to put it where the cursor is. Hover a keyword in the bar or in the text to see what it fills in, an example, when it exists, which prompts can use it and what it costs.

## How they work

- **Using a keyword turns on what fills it.** There is no switch to find: `{{Slopify_Summary}}` in a prompt adds the keyword digest to the run, `{{Slopify_Setting}}` adds the scenes call.
- **A line with nothing to fill is left out.** A `Series: {{Slopify_Series}}` line disappears when the channel has no series brief, and so does a `Next: {{Slopify_Next_Video}}` line when nothing is planned after this video.
- **Your own value wins.** A prompt saved before the prefix was reserved may already have a field named, say, `{{Slopify_Title}}`. When the project has a value for it, that value is used.
- **Each keyword works only where it can be filled.** `{{Slopify_Chapters}}` and `{{Slopify_Summary}}` can't be used in the Article prompt: the article isn't written yet when that prompt runs. The editor marks a misuse in place and Play refuses the run, naming the prompt and where the keyword works.
- **No keyword goes in the project title.** Slopify fills several of them from the title.
- **An unknown `Slopify_` name is refused when you save a prompt.** Rename it, for example `{{Slopify_Wish}}` to `{{Wish}}`. A prompt that already had such a name saves as it was and keeps asking for its value.

## Facts Slopify already has

Free: no AI call. Copied when the run starts, so later changes to the channel or its other videos never change a project already made. In **Edit project → Prompts**, **Refresh keyword facts** copies them again.

| Keyword | Fills in | Example | Works in |
| --- | --- | --- | --- |
| `{{Slopify_Title}}` | The video's title, with its keywords filled in | How Lighthouses Were Built on Bare Rock | Every prompt and entry |
| `{{Slopify_Channel}}` | The project's channel name | Quiet Histories | Every prompt and entry |
| `{{Slopify_Series}}` | The channel's series brief (Channels → Edit) | Calm histories of how things were made | Every prompt and entry |
| `{{Slopify_Links}}` | The channel's links, one per line | Website: https://example.com | Every prompt and entry |
| `{{Slopify_Previous_Video}}` | Title and link of the channel's previous video in the same series | The Canal Age – https://youtu.be/abc123 | Every prompt and entry |
| `{{Slopify_Next_Video}}` | Title of the next planned video in the same series and posting plan line | Tea Clippers and the Race Home | Every prompt and entry |
| `{{Slopify_Episode}}` | This video's number in its series on the channel | 7 | Every prompt and entry |
| `{{Slopify_Cast}}` | The channel's cast members with their descriptions | Mira: a keeper's daughter who kept the logbook | Every prompt and entry |
| `{{Slopify_Covered_Before}}` | The titles the channel already made, so the article avoids repeating them | The Canal Age | Every prompt and entry |
| `{{Slopify_Brand}}` | The brand kit's caption and title colours and font names | Colours: #F5C542. Fonts: Barlow. | Image and Thumbnail prompts |
| `{{Slopify_Release_Date}}` | The release date from the posting plan, read when the step runs | Thursday 22 October 2026 | Every prompt and entry |
| `{{Slopify_Chapters}}` | The article's chapter titles, one per line | The first lamps | Every prompt except Article and Script |
| `{{Slopify_Duration}}` | The finished video's length | 42 min 10 s | Description, Shorts, Review and Post prompts |

- In a **Description** prompt, `{{Slopify_Links}}`, `{{Slopify_Previous_Video}}` and `{{Slopify_Next_Video}}` stay links the description fills when it is shown or copied (`{{Previous video}}`, `{{Next video}}`, `{{Patreon}}`…), so changing a link changes every description at once. See [YouTube description](YouTube-Description).
- Moving the release date later never remakes anything, and neither does a new length.
- A brand-kit font installed on the computer (not uploaded to Slopify) is left out of `{{Slopify_Brand}}`.
- A **Text** intro or outro is narrated as written, so it can't say `{{Slopify_Release_Date}}`: set its Mode to **LLM**, which writes it as a request to the AI model.

## Written from the article

One shared AI call per run, the **keyword digest**, writes every one of these the run uses, once the article exists. It uses the project's text model and shows in the cost estimate as **Keyword digest**.

| Keyword | Fills in | Example | Works in |
| --- | --- | --- | --- |
| `{{Slopify_Summary}}` | Two or three sentences on what the video covers | How engineers raised towers on rocks the sea covered twice a day | Image, Thumbnail, Description, Shorts, Review and Post prompts |
| `{{Slopify_Hook}}` | The video's most click-worthy idea | The rock was under water half of every day. They built on it anyway. | The same |
| `{{Slopify_Thumbnail_Text}}` | Two to four words to put on the thumbnail | BUILT UNDER WATER | The same |
| `{{Slopify_Key_Facts}}` | Three to five striking facts, one per line | The tower stands 35 metres high. | The same |
| `{{Slopify_Quote}}` | One quotable line | A light is only as good as the person who keeps it. | The same |
| `{{Slopify_Tags}}` | Search terms, separated by commas | lighthouses, engineering history, maritime history | The same |

With **Article** set to Off these can't be used: there is no article to write them from.

## Per picture

Written for each picture by one AI call that reads the article, like the scenes of [Scenes from the article](Play-Images#scenes-from-the-article).

| Keyword | Fills in | Example | Works in |
| --- | --- | --- | --- |
| `{{Slopify_Scene}}` | What this picture shows: a moment of the article | A keeper climbs the spiral stair at dusk | Image and Thumbnail prompts |
| `{{Slopify_Setting}}` | The era and place of that moment, so the picture stays period-correct | A rocky Scottish coast, early 19th century | Image and Thumbnail prompts |
| `{{Slopify_Mood}}` | The feeling of that moment, for light and colour | tense | Image and Thumbnail prompts |
| `{{Slopify_Appearance}}` | How the video's subject and the characters in the picture look, looked up on the web | Mira: a wool coat and oilskin hat, a brass lamp | Image and Thumbnail prompts |

- `{{Slopify_Scene}}`, `{{Slopify_Setting}}` and `{{Slopify_Mood}}` turn scenes on for the picture whose prompt uses them, even with Images → **Scenes from the article** off. That costs one AI call per run, shared by every picture.
- `{{Slopify_Appearance}}` costs one AI call per run with web search, shared by every picture.
- In the shorts' image prompt, a line with a scene, setting or mood keyword is left out: each short's images already show what is said at that moment.

## Old names

`{{Scene}}` and `{{Appearance}}` are the old names of `{{Slopify_Scene}}` and `{{Slopify_Appearance}}`, and they keep working:

- `{{Appearance}}` means exactly the same as `{{Slopify_Appearance}}`.
- `{{Scene}}` still follows the Images switch: with **Scenes from the article** off, its line is left out. `{{Slopify_Scene}}` turns scenes on by itself.

The editor offers **Update to new names** on a prompt that still uses them. Renaming `{{Appearance}}` changes nothing else. Renaming `{{Scene}}` is its own button, because the picture then gets its scene even with the switch off, which adds one AI call per run.

## Related pages

- [Prompts](Prompts)
- [Images](Play-Images)
- [YouTube description](YouTube-Description)
- [Editing a project](Editing-a-Project)
