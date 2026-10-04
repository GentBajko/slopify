# Multiple Voices

A run can be narrated by several speakers instead of one voice reading the article. You pick a format (Audiobook, Podcast, Radio drama or Interview), give each speaker a voice, and Slopify has the text model write or split the script into speaker turns. You get a video whose captions know who is talking and, if you want them, an MP3 and an M4B audiobook file with chapters.

**Where to find it:** Play → **Narration** row → **Speakers** (the disclosure under the voice picker). On a finished project: Edit project → **Providers** → Speakers.

## Formats

The **Format** list under Speakers decides how many voices the run uses and how the video looks.

| Format | Speakers it starts with | Rules | Video |
|---|---|---|---|
| **Narration (one voice)** | none: the Narration row's voice reads everything | the default | Image flow |
| **Audiobook** | Narrator | needs one speaker with the Narrator role | Image flow; captions tagged with the speaker |
| **Podcast** | Alex and Sam, both hosts | needs at least two speakers | Image flow with a speaker panel |
| **Radio drama** | Narrator and Mara (a character) | needs one speaker with the Narrator role | Image flow; captions tagged with the speaker |
| **Interview** | Host and Guest | needs at least two speakers | Image flow with a speaker panel |

You can rename, recast or remove the starter speakers. A run can have up to 10 speakers.

When the channel has hosts (cast members marked **One of the channel's hosts** that have a voice), a new **Podcast** or **Interview** starts with them as its speakers instead of Alex and Sam, or Host and Guest. See [Cast library](Cast-Library#make-a-member-one-of-the-channels-hosts).

The **speaker panel** (Podcast and Interview) is a row of tiles, one per speaker, with the one talking lit in their colour and their name as a lower third. It is drawn together with burned-in captions, so set **Captions** to **Burn in** under Play → **Video and style** to see it. A speaker added from a channel's cast whose member has a reference picture shows that picture in their tile (the member's first picture, cropped square, taken when the run starts); everyone else shows their initials. Adding a picture to the cast later does not change projects already made.

## Set up a multi-voice run

1. On Play, open the **Narration** row and pick the **TTS** provider, model and **Voice** as usual. This voice reads the intro and outro; the speakers read the article.
2. Open **Speakers** and choose a **Format**.
3. Choose where the **Script** comes from (see [The script](#the-script)).
4. For each speaker, set a **Speaker name**, **Role**, **Voice provider**, **Voice model** and **Voice**. Add more with **Add speaker**, or pick someone from **Add from the cast**.
5. Optionally set **Pace** and **Pronunciations** per speaker, and press **Audition** to hear a speaker before the run.
6. Set **Gap between turns** and the switches below it.
7. For a podcast or interview, set Captions to **Burn in** so the speaker panel shows.
8. Review the estimate in the right rail and start the run.

If something is missing, Play names it before you can start, for example "A podcast needs at least two speakers" or "An audiobook needs a narrator. Set one speaker's role to Narrator under Speakers".

## The script

| Script option | What it does | Cost |
|---|---|---|
| **Write a script (Script prompt)** | The text model writes speaker turns from a **Script** prompt in your Library, one `Name: words` paragraph per turn. The article prompt picker on the Article row becomes a **Script prompt** picker. | One text-model call, in place of the article call |
| **Split the article into speakers** | Keeps the article as written or pasted, then the text model hands its narration and dialogue to the speakers. Audiobook only. | One extra text-model call |

Other formats must use **Write a script**. When the article is split, the split must keep the article's words; if the model changes them, the call is asked again.

### Script format

Write Script prompts in **Library → Prompts** with the kind **Script**. The text model answers in this shape:

```
# Section title

Alex: What one speaker says, as one paragraph.

Sam: The next turn.
```

- A `#` heading starts a section. Sections become the chapters of the MP3 and M4B files.
- A turn starts with a speaker's name and a colon. A line directly under a turn continues it.
- Text in `[square brackets]`, such as `[laughs]`, is a stage direction and is never read aloud.
- A script that names someone who is not one of your speakers, or has a paragraph that is not a turn, stops the Article stage with the line to fix.

On the project page the Article section shows the script as the speakers read it: each turn under its speaker's name in their colour, with the sections as headings. If the script can't be narrated, it says why and points you to Edit project → Article.

## Speaker options

| Option | What it does | Default / range |
|---|---|---|
| **Speaker name** | The name the script uses for this speaker's turns (`Name: words`), shown on captions and in the speaker panel. Letters, numbers, spaces, dots, apostrophes and hyphens; each speaker needs a different name. | Up to 40 characters |
| **Role** | Narrator, Host, Guest or Character. The text model is told each speaker's role when it writes or splits the script. | Set by the format |
| **Voice provider** | The text-to-speech service for this speaker, charged per character of their lines. Speakers may use different providers. Changing it clears the model and voice. | None |
| **Voice model** | The provider's speech model. Pronunciations need an Inworld TTS-2 model. | None |
| **Voice** | One of the voices you added under **Settings → Voices** for that provider, filtered to the project's language. Tick **Show all voices** to see the rest. | None |
| **Pace** | How fast this speaker talks relative to the voice's own speed. It is applied after the speech is made, so changing it costs nothing. | Normal; 0.8×, 0.9×, Normal, 1.1×, 1.2× |
| **Pronunciations** | One `Term: /IPA/` per line (for example `Arda: /ˈɑɹdə/`), for this speaker only. Used on Inworld TTS-2 voices, ahead of the article's Pronunciation Glossary. | Empty |
| **Audition** | Speaks this speaker's first line of the script (or a sample line) in their voice. | One real text-to-speech request; the button shows the price, such as "Audition · about $0.0004" |

A pronunciation line the voice can't use (no slashes, ARPAbet, or sounds the project's language does not have) is skipped and that word is read as ordinary text; the other lines still apply. The Speakers panel says which lines are skipped and why as you type.

## Run-wide options

| Option | What it does | Default / range |
|---|---|---|
| **Gap between turns** | The pause between one speaker's turn and the next. Longer feels calmer; shorter feels like a lively talk. | 0.35 s; choose 0, 0.2, 0.35, 0.5, 0.8 or 1.2 s |
| **Speaker names on captions** | Puts the speaker's name before their captions, like `Ada:` and their words. In the VTT file it is written as `<v Name>`. | On for Podcast and Interview, off otherwise |
| **One request for consecutive turns where the voice provider can (ElevenLabs v3, Gemini)** | Sends back-to-back turns as one multi-speaker request where the provider has one, so the voices react to each other: ElevenLabs v3 with up to 10 voices, Google Gemini with 2 (a third voice starts a new request). Fewer requests, same characters charged. Other providers read each turn on its own. | On |
| **Also make MP3 and M4B files with chapter markers** | Saves the whole narration as `narration.mp3` (ID3 chapters) and `audiobook.m4b` (AAC with chapter markers), one chapter per script section. Made on your computer at no provider cost. | On |

The MP3 and M4B appear with the Video section's downloads on the project page, and play in Slopify's own audio player with the chapter marks on its track. Slopify does not publish them anywhere.

## Audiobooks in chapters

An audiobook can be one chapter of a book, so a long book is made one chapter per project and a player keeps the chapters together.

1. On Play, pick the **Audiobook** format under Speakers.
2. Turn on **A chapter of a book**.
3. Type the **Book title** (the same for every chapter) and the **Chapter** number (from 1).
4. Start the run.

The MP3 and M4B carry the book as their album and the chapter as their track. Projects shows the project as **Book · Chapter N**, for example "The Wind in the Willows · Chapter 3".

### Make the next chapter

On a finished audiobook's project page, **Make the next chapter** (beside **Edit settings**) opens a new Play draft for the next chapter: the same speakers and voices, channel and cast, prompts and settings, with the chapter number one higher. Write or paste the new chapter's text there, then start it. An audiobook that was not a book yet becomes one, named after itself, starting at chapter 2.

## Speakers from a channel's cast

A channel's cast member can have a voice, so a host or recurring character sounds the same in every episode.

1. Open **Channels**, pick the channel, open its **Cast** tab and edit a member.
2. Under **Cast voice**, pick a **Voice provider**, **Voice model** and **Voice**. The list shows voices that speak the channel's language. Leave the provider empty for no voice.
3. On Play, under Speakers, pick the member from **Add from the cast**. Only members with a voice are listed.

The speaker takes the member's name and voice. Every run started later, whether from Play, a batch, a schedule or a template, takes that member's voice, pace and pronunciations as they are when the run starts. Projects already made keep the voice they were made with. See [Cast-Library](Cast-Library) for editing the cast.

## Delivery tags

With a **Narration Preparation** prompt picked (Narration row → **More audio settings**), each turn of a speaker on Inworld's TTS-2 model is prepared on its own before it is spoken. The text model sees the turn and who says it (for example `Rat (character)`) and adds cues:

- A spoken direction at the start of a sentence, such as `[say shyly and a little uncertainly]`, held until the next one or `[reset]`.
- Non-verbal sounds where they happen: `[laugh]`, `[breathe]`, `[sigh]`, `[cough]`, `[clear throat]` and `[yawn]`.

Each turn is its own request, so a direction never leaks into the next speaker, and every speaker on TTS-2 gets cues of their own. Turns of speakers on other voices, or on TTS-2 Flash (which ignores directions), are spoken as written. At least one speaker must be on TTS-2, or Play asks you to choose that model for a speaker or clear Narration Preparation under Narration → **More audio settings**. The Narration row's own model (which reads the intro and outro) must be Inworld TTS-2 too. The tags are only in what the voice is sent: captions, word timing, the MP3/M4B chapters and the script download never show them. See [Play-Narration](Play-Narration) for Narration Preparation itself.

## How the audio is made

- Every turn is its own request in its speaker's voice, then the turns are joined with the gap between turns.
- Narration aliases (Library → Narration aliases) apply to every turn.
- Changing one speaker's voice remakes only that speaker's turns.
- With **Level the volume** on (the default for new runs), each turn is brought to one common loudness before joining, so a quiet host and a loud guest sit at the same level. The MP3 and M4B are mastered to the audio files volume (−18 LUFS by default).
- **Pause between sentences** lengthens the quiet between sentences inside a turn; the gap between turns stays the Gap between turns.

## Captions with several speakers

- Captions never mix two speakers in one line, and each speaker's captions carry their colour.
- Captions you edit by hand in Edit project → **Captions** keep their speaker. A caption you add takes the speaker of the narration under it.
- [Shorts](Shorts) cut from a multi-voice video start and end on a speaker's turn.

## Change speakers on a finished project

1. Open the project and press **Edit project**.
2. Open **Providers** and change the Speakers panel.
3. Save. The rebuild review lists what will be remade: only the turns of speakers whose voice changed are spoken again, paid per character.

## Tips

- Audition each speaker before a long run; a wrong voice is cheaper to catch at one line.
- If a podcast shows no speaker panel, check that Captions is set to Burn in.
- Give speakers clearly different voices and names; the script and captions match speakers by name.

## Related pages

- [Play-Narration](Play-Narration)
- [Cast-Library](Cast-Library)
- [Channels](Channels)
- [Prompts](Prompts)
- [Narration-Aliases-and-Glossary](Narration-Aliases-and-Glossary)
- [Other-Languages](Other-Languages)
- [Editing-a-Project](Editing-a-Project)
- [Costs-and-Run-Cost](Costs-and-Run-Cost)
