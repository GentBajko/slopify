# Narration Aliases and Glossary

Three tools control how the narrator says words without changing what is written. **Name pronunciations** is your own list of names with their IPA, used before anything an article says, so a name sounds the same in every video. **Narration aliases** swap a written form for a spoken one, such as `Dr.` said as "Doctor", with any generated voice. The **Pronunciation Glossary** is the list each article writes for itself, such as `Arda: /ˈɑɹdə/`. IPA is read by Inworld's TTS-2 voices; aliases work with every voice. In all three the article, the transcript and the captions keep the written words; only the audio changes.

**Where to find it:** your list in **Settings → Voices → Name pronunciations**, aliases in **Settings → Voices → Pronunciation**. The switches are on Create under **Narration → Change → More narration settings**, and in a project's **Edit settings** → **Narration**. A project's own glossary is shown on its **Article** section, in the **Pronunciation** tab.

## Name pronunciations

Your list settles a name once. Every project copies it when it starts, and its entries come **before** the glossary that project's article wrote, so the name is said your way whatever the article spelled out.

1. Open **Settings → Voices → Name pronunciations**.
2. Write one `Term: /IPA/` per line, in standard-English IPA between slashes:

```
Gygax: /ˈɡaɪɡæks/
Faerûn: /feɪˈruːn/
Mordenkainen: /ˌmɔːrdənˈkeɪnən/
```

3. Press **Save pronunciations**. The line under the box says how many names the list pronounces, and a note names any line narration has to skip, by its number and reason, the way the article's glossary does.

- One IPA word per written word. A hyphenated name's parts each get one.
- A possessive follows its name: `Gygax's` is said from the `Gygax` entry.
- A dash, `n/a` or nothing leaves the name read as written: useful for a name you want plain.
- Up to 100,000 characters, which is thousands of names.
- Only Inworld **TTS-2** and **TTS-2 Flash** read IPA. For any other voice, use an alias instead.
- **Use pronunciations** must be on for the project (the default) — the same switch that reads the article's glossary.

A project keeps the copy it started with. Editing the list later changes new projects only, until you open a project's **Edit settings** → **Narration** and press **Copy the list again** under **Use pronunciations**; only the narration where a changed name appears is made again.

### Two people, or an agent, at the same list

The whole list is saved at once, so Slopify makes sure one save never quietly replaces another. Every save carries the version of the list it was made from. If something else saved meanwhile — a second window, or an agent — the save is refused and the page says so:

> **The list changed somewhere else.** An agent saved it: it has 3 names you don't have, 1 said differently.

Nothing is lost. What you typed stays in the box, and you choose:

- **Save mine anyway** keeps what is on screen, over theirs.
- **Load theirs instead** puts their list in the box, so you can add your change to it and save.

An agent gets the same refusal as a sentence, with the list as it stands: it reads the version, folds its change into that text, and saves again (`get_library_pronunciations`, then `set_library_pronunciations` with `{text, version}`).

### Which list wins

| Where a pronunciation comes from | Order |
|---|---|
| **Name pronunciations** (your list) | First: it wins everywhere |
| The article's own **Pronunciation Glossary** | Next, for names your list does not have |
| **Other projects' pronunciations**, while shared | Last, for names neither of the above has |

An alias beats all three, because it changes the words before the sounds are decided.

## Narration aliases

### Add aliases

1. Open **Settings → Voices → Pronunciation**.
2. Press **Add alias**. A new row appears in the list, titled **Alias N**, with its fields under it.
3. Fill in the row:

| Column | What it does | Default / limit |
|---|---|---|
| **Written** | The word or phrase as it appears in the article. Spaces inside it match any spacing. | Up to 200 characters |
| **Say it as** | What the narrator says instead, spelled the way it sounds. | Up to 500 characters |
| **Whole word** | On: matches only where the written form stands as a word of its own, never inside a longer word. Off: matches inside other words too. | On |
| **Match case** | On: matches only with the same capital letters, so `US` is not `us`. Off: capitals are ignored, so `DR.` and `dr.` match too. | Off |

4. Add as many rows as you need, up to 1,000.
5. Press **Save aliases**. The whole list is saved at once. A row that can't be saved is marked with the reason.

Examples:

| Written | Say it as |
|---|---|
| `Dr.` | Doctor |
| `Ms.` | Miss |
| `et al.` | and others |
| `vs.` | versus |
| `NASA` | nasa |

Each row's title line sums it up, for example "Says Dr. as Doctor · whole word", or "Not filled in yet". To remove one, press its bin button (**Remove alias N**) and then **Save aliases**. On a wide screen, how aliases are used is explained beside the list.

### Rules

- Two aliases can't share a written form.
- Where two overlap in the text, the one starting first wins, then the longer.
- A multi-word alias is read with single spaces around it: "Grey et al. wrote" goes to the voice as "Grey and others wrote".
- An alias wins over a Name pronunciations entry and a Pronunciation Glossary entry for the same words.
- Aliases work with every generated voice, and in multi-voice runs they apply to each speaker's turn.
- Aliases also change the sentences **Narration preparation** reads, so its cues match what is said.

### Use aliases in a video

1. On Create, open the **Narration** row with **Change**, then **More narration settings**.
2. Keep **Use your pronunciation list** on (the default for new drafts).
3. Start the run.

A project copies your Pronunciation list when it starts. Editing the list later never changes a started project until you open its **Edit settings** → **Narration** and press **Copy the list again** beside the aliases switch. Only the parts of the narration where a changed alias appears are made again.

Projects from before aliases existed have the switch off and nothing copied.

### Captions stay written

Captions show the written words, while the audio says the alias. A caption reads "Dr. Grey" while the voice says "Doctor Grey". Caption timing matches each written word to its spoken form.

## The Pronunciation Glossary

The Pronunciation Glossary is a section at the end of the article that lists names with their pronunciation in IPA. With a voice that supports it, the narrator reads each listed name the way the glossary says, with no extra AI call. The glossary itself is never narrated.

### Which voices support it

Inworld **TTS-2** and **TTS-2 Flash**. With other services or models the tick is not shown; your choice is kept for when you pick one of those voices.

### Get a glossary into the article

The glossary comes from your article, so ask for it in your Article prompt. For example, add to the prompt:

```
At the end, add a section titled "Pronunciation Glossary". List every unusual name
as Term: /IPA/ in slash-delimited standard-English IPA. For a foreign name, give an
English approximation.
```

Each line looks like this:

```
Arda: /ˈɑɹdə/
Hypatia: /haɪˈpeɪʃə/
```

A table with `Term | IPA` columns works too. If you paste your own article, add the section yourself.

### Turn it on

1. On Create, open **Narration → Change → More narration settings**.
2. Keep **Use pronunciations** on (the default). It shows only while the voice is one that reads IPA, and it covers both your Name pronunciations and this article's glossary.
3. Optional: keep **Also use pronunciations from my other projects** on (the default). It adds every term from your other projects' glossaries, copied when this project starts. This project's own glossary wins where they differ. Turn it off to use only this article's glossary.

### Entries that are skipped

An entry narration can't use is skipped and read as ordinary text. It never blocks the narration. The project's **Article** section shows a **Pronunciation** tab with the glossary, and a note such as "2 entries are skipped by the narration and read as ordinary text", listing each by number and reason:

| Reason shown | What to fix |
|---|---|
| use Term: /IPA/ or a Term \| IPA table | The line isn't in either format. |
| use slash-delimited standard-English IPA (or "IPA" for other languages) | The pronunciation isn't between slashes. |
| use standard-English IPA only, not ARPAbet, delivery tags or non-English sounds; give a foreign name an English approximation | The IPA uses symbols the voice can't read. For English, use standard-English sounds only. |
| supply one IPA word for each written word | "New York" needs two IPA words. |
| an earlier entry already gives this term a different pronunciation | The term is listed twice with different sounds. |

To fix skipped entries, edit the Pronunciation Glossary at the end of the article in **Edit settings** → **Article**, then save. See [Editing a project](Editing-a-Project).

## Which one do I use?

| You want | Use |
|---|---|
| An abbreviation read in full (Dr., St., vs.) | Alias |
| A word read as a different word or spelling | Alias |
| Any voice service | Alias |
| A name said the same way in every video | Name pronunciations |
| To correct a name once, for everything you have made since | Name pronunciations |
| A made-up or foreign name said exactly right, on Inworld TTS-2 | Name pronunciations, or the article's glossary |
| Pronunciations that come with each article automatically | The article's glossary |

## Tips

- Spell **Say it as** the way it sounds, not the way it is written: "Shiv-awn" rather than "Siobhan".
- Keep **Whole word** on unless you really want to match inside other words. Otherwise `St.` could fire inside unrelated text.
- Listen to the first minute of a new run before a long batch, and add aliases for anything the voice stumbles on.
- A name that comes back video after video belongs in **Name pronunciations**, not in each article's prompt: one line there holds for every project that follows.

## Related pages

- [Create: Narration](Create-Narration)
- [Prompts](Prompts)
- [Editing a project](Editing-a-Project)
- [Multiple voices](Multiple-Voices)
- [Keys and Services](Providers-and-Keys)
