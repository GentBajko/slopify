# Intros and Outros

Intros and outros are short narrated passages read before and after the body of a video, in the same voice: a greeting, a series tagline, a sign-off, a call to subscribe. Write one as the exact words to say, or as instructions the AI follows to write it fresh for each video.

**Where to find it:** **Prompts** → **Intros** and **Outros**, at the foot of the list of kinds. Pick them on Create in the **Intro** and **Outro** pickers (Narration row → **More narration settings**), in a project's **Edit settings** → **Narration**, or as a channel default in the channel's brand kit.

## Exact words or written by the AI

Each intro and outro says **What the narrator reads**:

| Choice | What happens | Extra cost |
|---|---|---|
| **Say these exact words** (default) | "Narrated exactly as written, with the keywords filled in." No extra call. | Only the voice request |
| **Let the AI write it from these instructions** | The instructions go to the AI that writes the article (**Written by**), with the title, the keyword values and the article, and its answer is narrated. The run then needs a writing service. | One AI call per video, plus the voice request |

Either way the intro or outro is narrated as its own audio file with the run's voice: one voice request each.

## Write an intro or outro

1. Open **Prompts** and pick **Intros** or **Outros** at the foot of the list of kinds.
2. Press **New intro** (or **New outro**).
3. Fill in the editor:
   - **Name**: what Create and a project's Edit settings list it by. Up to 200 characters, unique within its kind.
   - **Intro or outro**: **Intro, before the video** or **Outro, after the video**. You can change it later.
   - **What the narrator reads**: **Say these exact words** or **Let the AI write it from these instructions**.
   - **Words to say** (or **Instructions for the AI**): the words the narrator says, or the instructions the AI writes from. Each `{{keyword}}` becomes a question on Create, just like in prompts.
4. Press **Save** (or `Ctrl+S`).

### Examples

An intro said as written:

```
Welcome back to the channel. Tonight: {{Topic}}. Get comfortable.
```

An outro the AI writes:

```
Write two sentences that close this video warmly. Mention one idea from the article
the listener can think about tonight. Do not ask them to subscribe.
```

## Use one in a video

**On Create:**

1. Open the **Narration** row with **Change**, then open **More narration settings**.
2. Pick one in **Intro** and, if you like, in **Outro**. **Off** reads none.
3. Fill in any new keywords it asks for.

**From Prompts:** press **Make a video** on its row. It is picked in your open draft and Create opens on its field.

**For a whole channel:** open **Channels** → the channel → **Name and look** and set **Intro** and **Outro** under the brand kit. Every video of that channel whose template has no intro or outro of its own gets them. See [Channels](Channels).

**In a finished project:** open **Edit settings** → **Narration**, pick a different intro or outro under **Intro and outro**, and save. Only the parts that change are made again. See [Editing a project](Editing-a-Project).

## Edit, duplicate, delete and history

Intros and outros have the same row actions as prompts: **Edit**, **Make a video** and **More** (**Duplicate**, **Versions**, **Delete**):

| Action | What it does |
|---|---|
| **Edit** | Opens the editor. Change it and press **Save**. |
| **Duplicate** | Opens the editor with a copy to rename and save. |
| **Make a video** | Picks the intro or outro in your open draft and opens Create on it. |
| **Versions** | Every version and a compare, exactly as for prompts. See [Prompts](Prompts#history-and-versions). |
| **Delete** | Asks first, then moves it to **Settings → Trash** for 30 days. |

Use **Search all prompts** (`/`) to find one by name or words: it looks through the intros, the outros and every kind of prompt. Rename one in its editor.

A project keeps its own copy of the intro and outro it started with, so editing one here changes only runs started later. Templates keep their own copies too.

## Tips

- Keep intros short. Viewers leave during long openings; two sentences is plenty.
- An outro the AI writes to sum up the video costs one small AI call and never repeats itself across videos.
- Put the channel's standard intro and outro in the brand kit instead of every template.

## Related pages

- [Create: Narration](Create-Narration)
- [Prompts](Prompts)
- [Channels](Channels)
- [Prompts and Templates](Prompts-and-Templates)
