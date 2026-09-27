# Narration Aliases and Glossary

Two tools control how the narrator says words without changing what is written. **Narration aliases** swap a written form for a spoken one, such as `Dr.` said as "Doctor", with any generated voice. The **Pronunciation Glossary** gives exact IPA pronunciations for names, such as `Arda: /ˈɑɹdə/`, with Inworld's TTS-2 voices. In both cases the article, the transcript and the captions keep the written words; only the audio changes.

**Where to find it:** aliases in **Library → Aliases**. Both switches are on Play under **Narration → Change → Audio Advanced**, and in **Edit project**. A project's glossary is shown on its **Article** section, in the **Pronunciation** tab.

## Narration aliases

### Add aliases

1. Open **Library → Aliases**.
2. Press **Add alias**. A new row appears.
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

To remove one, press its remove button and then **Save aliases**.

### Rules

- Two aliases can't share a written form.
- Where two overlap in the text, the one starting first wins, then the longer.
- A multi-word alias is read with single spaces around it: "Grey et al. wrote" goes to the voice as "Grey and others wrote".
- An alias wins over a Pronunciation Glossary entry for the same words.
- Aliases work with every generated voice, and in multi-voice runs they apply to each speaker's turn.
- Aliases also change the sentences **Narration Preparation** reads, so its cues match what is said.

### Use aliases in a video

1. On Play, open the **Narration** row with **Change**, then **Audio Advanced**.
2. Keep **Use narration aliases** on (the default for new drafts).
3. Start the run.

A project copies the Library's aliases when it starts. Editing the Library later never changes a started project until you open **Edit project** and press **Update from Library** beside the aliases switch. Only the parts of the narration where a changed alias appears are made again.

Projects from before aliases existed have the switch off and nothing copied.

### Captions stay written

Captions show the written words, while the audio says the alias. A caption reads "Dr. Grey" while the voice says "Doctor Grey". Caption timing matches each written word to its spoken form.

## The Pronunciation Glossary

The Pronunciation Glossary is a section at the end of the article that lists names with their pronunciation in IPA. With a voice that supports it, the narrator reads each listed name the way the glossary says, with no extra text-model call. The glossary itself is never narrated.

### Which voices support it

Inworld **TTS-2** and **TTS-2 Flash**. With other providers or models the switch is greyed out and says "Unavailable for this provider or model. Your saved preference is retained."

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

1. On Play, open **Narration → Change → Audio Advanced**.
2. Keep **Use Pronunciation Glossary** on (the default).
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

To fix skipped entries, edit the Pronunciation Glossary at the end of the article in **Edit project → Article**, then save. See [Editing a project](Editing-a-Project).

## Aliases or glossary?

| You want | Use |
|---|---|
| An abbreviation read in full (Dr., St., vs.) | Alias |
| A word read as a different word or spelling | Alias |
| Any voice provider | Alias |
| A made-up or foreign name said exactly right, on Inworld TTS-2 | Glossary |
| Pronunciations that come with each article automatically | Glossary |

## Tips

- Spell **Say it as** the way it sounds, not the way it is written: "Shiv-awn" rather than "Siobhan".
- Keep **Whole word** on unless you really want to match inside other words. Otherwise `St.` could fire inside unrelated text.
- Listen to the first minute of a new run before a long batch, and add aliases for anything the voice stumbles on.

## Related pages

- [Narration](Play-Narration)
- [Prompts](Prompts)
- [Editing a project](Editing-a-Project)
- [Multiple voices](Multiple-Voices)
- [Providers and keys](Providers-and-Keys)
