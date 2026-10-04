# Intros and Outros

Intros and outros are short narrated passages read before and after the body of a video, in the same voice: a greeting, a series tagline, a sign-off, a call to subscribe. Write one as fixed text, or as an instruction the text model answers fresh for each video.

**Where to find it:** **Library → Intros & outros**. Pick them on Play in the **Intro** and **Outro** pickers (Narration row → **More audio settings**), in **Edit project**, or as a channel default in the channel's brand kit.

## Text or LLM

Each entry has a **Mode**:

| Mode | What happens | Extra cost |
|---|---|---|
| **Text** (default) | "Text is narrated as written." Keywords are filled in, with no extra call. | Only the voice request |
| **LLM** | "LLM is an instruction whose answer is narrated." The body goes to the project's text model with the title, the keyword values and the article, and the answer is narrated. The run then needs an LLM. | One text call per entry, plus the voice request |

Either way the intro or outro is narrated as its own audio file with the run's voice: one voice request each.

## Write an intro or outro

1. Open **Library → Intros & outros**.
2. Choose **Intros** or **Outros** with **Entry category**.
3. Press **New intro or outro**.
4. Fill in the editor:
   - **Name**: what Play and Edit project list it by. Up to 200 characters, unique within its category.
   - **Category**: **Intro** (read before the body) or **Outro** (read after it). You can change it later.
   - **Mode**: **Text** or **LLM**.
   - **Body**: in Text mode, the words the narrator says; in LLM mode, the instruction whose answer is said. Each `{{keyword}}` becomes a field on Play, just like in prompts.
5. Press **Save** (or `Ctrl+S`).

### Examples

A text intro:

```
Welcome back to the channel. Tonight: {{Topic}}. Get comfortable.
```

An LLM outro:

```
Write two sentences that close this video warmly. Mention one idea from the article
the listener can think about tonight. Do not ask them to subscribe.
```

## Use one in a video

**On Play:**

1. Open the **Narration** row with **Change**, then open **More audio settings**.
2. Pick an entry in **Intro** and, if you like, in **Outro**. **Off** reads none.
3. Fill in any new keyword fields the entry added.

**From the Library:** press **Use in Play** on the entry's row. It is picked in your open Play draft and Play opens on its field.

**For a whole channel:** open **Channels** → the channel → **Brand** and set **Intro** and **Outro** under the brand kit. Every video of that channel whose template has no intro or outro of its own gets them. See [Channels](Channels).

**In a finished project:** open **Edit project**, pick a different intro or outro, and save. Only the parts that change are remade. See [Editing a project](Editing-a-Project).

## Edit, duplicate, delete and history

Entries have the same row actions as prompts:

| Action | What it does |
|---|---|
| **Edit** | Opens the editor. Change it and press **Save**. |
| **Duplicate** | Opens the editor with a copy to rename and save. |
| **Use in Play** | Picks the entry in the open Play draft. |
| **History** | Versions, compare and **Used by**, exactly as for prompts. See [Prompts](Prompts#history-and-versions). |
| **Delete** | Asks first, then moves it to **Settings → Backup & storage → Trash** for 30 days. |

Use **Search intros and outros** (`/`) to find one by name. The pencil beside a name renames the entry in its row, with **Undo** on the notice; see [Rename in the row](Library-Overview#rename-in-the-row).

A project keeps its own copy of the intro and outro it started with, so editing an entry here changes only runs started later. Templates keep their own copies too.

## Tips

- Keep intros short. Viewers leave during long openings; two sentences is plenty.
- An LLM outro that summarises the video costs one small text call and never repeats itself across videos.
- Put the channel's standard intro and outro in the brand kit instead of every template.

## Related pages

- [Narration](Play-Narration)
- [Prompts](Prompts)
- [Channels](Channels)
- [Library overview](Library-Overview)
