# Create: Narration

The narration is the article read aloud by an AI voice. On Create you pick the voice service, its model and the voice, and fine-tune how the text is split, prepared and pronounced. You get a narration track that the captions, cuts, chapters and shorts are all timed from.

**Where to find it:** Create → **Narration** row → **Change**. The pauses, the volume levelling and the silences sit in Create → **Video and style** → **Sound polish**; they are described here because they shape the narration.

## Choose where the narration comes from

The row starts with a **Narration** switch:

| Choice | What happens | Cost |
| --- | --- | --- |
| **AI voice (paid per character)** (default) | A voice service reads the article aloud. | Charged by the service per character |
| **My own audio file** | Uses an audio file you upload (**Narration file**), as it is. | None |
| **Off** | Makes a silent video with no captions, YouTube description or shorts. The row reads "None: a silent video." | None |

With **My own audio file**, the file is used as it is; include any intro and outro in it. It is never levelled piece by piece; only the final master reaches it when **Level the volume** is on.

## Pick a voice

1. Open the **Narration** row and leave it on **AI voice (paid per character)**.
2. Under **Read by**, pick the **Service**. Each service in the list says when it has **No key** or is **Not found**.
3. Pick the **Model**.
4. Pick a **Voice**. When none of the listed services has a key, the line under it offers **Add a voice key ↗**, or **Set Narration to Off**.

| Option | What it does | Default |
| --- | --- | --- |
| **Service** | The voice service, charged per character of text: ElevenLabs, OpenAI, Cartesia, Inworld, Google Gemini, or **System voice**, your computer's own speech, which is free (it says **Not found** when no speech program is installed; see [the system voice](Providers-and-Keys#the-system-voice)). Changing it clears the model and voice. | The voice service your template or Settings picks |
| **Model** | The service's voice model. Models differ in quality, languages, speed and price per character. Narration Preparation needs Inworld TTS-2. The line under it says whether the model was checked, with **Manage models ↗**. | The service's default |
| **Voice** | Who reads the narration: the voices you added under Settings → Voices for this service, for the project's language. With several speakers, this voice reads only the intro and outro. | None |
| **Show all voices** | Shown when some voices are hidden because they are listed for other languages. Tick it to pick one anyway, for example a multilingual voice whose languages are listed wrong. A voice with unknown languages is always shown. | Off |

### Hear a sample

**Hear a sample of your text in this voice** folds out a **Passage** box and **Hear the sample**. It reads one passage of up to 300 characters in the picked voice, at the service's price for those characters (free with the system voice). The Pronunciation Glossary and Narration Preparation are not applied, and the sample is not reused in the run.

### Speakers

Under the voice is the **Speakers** fold. It reads **One voice** by default. Open it to pick a **Format**: **Narration (one voice)**, **Audiobook**, **Podcast**, **Radio drama** or **Interview**, with several speakers, each with their own voice. Picking **Audiobook** or **Podcast** at the top of Create sets this for you. See [Multiple Voices](Multiple-Voices) for every speaker setting, and [Other Languages](Other-Languages) for narrating in another language.

## More narration settings

**More narration settings** is a fold under the voice. Its line says what is set, for example **Read as one piece, tables and figures described**.

### Split the narration

How the narration is split into voice requests. Split it when a service refuses long text. It changes the number of requests, not the characters charged.

| Option | What it does | Default |
| --- | --- | --- |
| **Split the narration by** | **Nothing (one piece)** sends the narration in one request. **Paragraph** sends one per paragraph. **Every 500 words** or **Every 3000 characters** ends each request at a sentence end. | **Nothing (one piece)** |
| **Words** / **Characters** | How long each request may be. Each request ends at the last whole sentence that fits, so a single longer sentence stays whole. Characters count spaces. | 500 words, or 3000 characters |

Up to 10,000 words or 1,000,000 characters per request.

### Intro and outro

An intro is read before the article and an outro after it. Both are saved under **Prompts** → **Intros** and **Outros**.

| Option | What it does | Default |
| --- | --- | --- |
| **Intro** | Read before the article. One saved as **Say these exact words** is read as written; one saved as **Let the AI write it from these instructions** is written for each video, one extra AI call. | Off |
| **Outro** | Read after the article, such as a sign-off. Exact words or AI-written, as above. | Off |

1. Open the **Narration** row and press **Change**.
2. Open **More narration settings**.
3. Pick an **Intro** and an **Outro**, or leave them **Off**.
4. Optional: set **Silence between segments** in **Video and style** → **Sound polish** to change the quiet between the intro, the article and the outro (Settings has the default, 3 seconds).

The channel's brand kit can fill the intro and outro when you leave them at their default. With several speakers, the voice under **Read by** reads the intro and outro. Your own audio file must already include any intro and outro. See [Intros and Outros](Intros-and-Outros).

### Narration Preparation

Has the AI writer add delivery directions and sounds, such as a sigh or a laugh, before the voice reads, following the narration prompt you pick. The words stay the same.

| Option | What it does | Default |
| --- | --- | --- |
| **Narration Preparation** | Pick a narration prompt, or **Off**. One AI call per narration piece and per intro or outro. **New narration prompt ↗ (opens Prompts)** writes one. | Off |

It needs the Inworld TTS-2 model. With several speakers it works per speaker: each turn of a speaker on Inworld TTS-2 is prepared on its own, with the speaker's name and role, so every voice gets its own cues. At least one speaker must use TTS-2; turns of speakers on other voices are spoken as written. See [Multiple Voices](Multiple-Voices). When nothing earlier needs a writer (your own text, say), **Written by** appears in this row.

### Pronunciation Glossary

| Option | What it does | Default |
| --- | --- | --- |
| **Use Pronunciation Glossary** | Reads names with the IPA in the article's Pronunciation Glossary, such as `Arda: /ˈɑɹdə/`, with no extra AI call. Works with Inworld TTS-2 and TTS-2 Flash. The written text stays unchanged. | On |
| **Also use pronunciations from my other projects** | Adds every term from your other projects' glossaries, copied when this project starts. This project's own glossary wins where they differ. Turn it off to use only this article's glossary. | On |

With another service or model, the line under it says "Only Inworld TTS-2 voices read it; your choice is kept for when you pick one."

To get a glossary, ask for one in your article prompt: a section in slash-delimited standard-English IPA, one `Term: /IPA/` per line, with an English approximation for foreign names. A line with sounds English lacks is read as plain text. The glossary is never narrated itself. See [Narration Aliases and Glossary](Narration-Aliases-and-Glossary).

### Narration aliases

| Option | What it does | Default |
| --- | --- | --- |
| **Use narration aliases** | Says the words listed under Settings → Voices → **Pronunciation** the way they are written there, such as `Dr.` as `Doctor`, with any AI voice. They are copied when the project starts. The article and captions keep the written words. | On |

Manage the list in [Narration Aliases and Glossary](Narration-Aliases-and-Glossary).

### Tables, figures and code

An article written to be read can contain tables, pictures, equations and code. Read aloud cell by cell or symbol by symbol, they are noise.

| Option | What it does | Default |
| --- | --- | --- |
| **Describe tables and figures in the narration** | The AI writer writes a short spoken passage for each table, picture, equation and code block (a table's pattern, what a figure or equation means, what code does), and the narration says it in its place. One extra AI call per block, in the estimate and kept for reuse. The article and PDF keep the real table; captions show what is said. | On |
| **Leave code out** | Shown under the switch above. Drops code blocks from the narration instead of summing each up in a sentence or two. Tables, figures and equations are still described. | Off |
| **Also show them on screen** | Shown under the switch above. Each block the narration describes is also shown in the video while it is described: the article's own picture for a figure, a card drawn in your brand kit's title font and colour for the rest. The images take turns around them, and shorts that include one show it upright. Drawn on this computer at no cost. | On |

Even with the switch off, some things are handled for you: links are read without their address, and footnote markers, the Sources Consulted section and the Pronunciation Glossary are never narrated.

## Pauses between sentences and paragraphs

Some voices run one sentence into the next with barely a breath. These settings add quiet where the voice's own pause is shorter. They never shorten a pause or cut a word, and the captions follow. They are in **Video and style** → **Sound polish**, and only show while the narration is an AI voice.

| Option | What it does | Default / range |
| --- | --- | --- |
| **Pause between sentences (seconds)** | The least quiet after each sentence. About 0.25 s is brisk, 0.35 to 0.45 natural or documentary, 0.5 to 0.8 an audiobook's relaxed pace, 0.8 and up sleep content. 0 leaves the voice's own. | 0.4; 0 to 2 in steps of 0.05 |
| **Pause between paragraphs (seconds)** | The least quiet at the end of a paragraph, when you want more than between sentences. Try 0.8 to 1.2 for a slower read. 0 keeps the sentence pause. | 0; 0 to 2 in steps of 0.05 |

The pauses are added on this computer before the word timing, so the captions, cuts, shorts and YouTube chapters stay in step. With several speakers, the gap between turns is **Gap between turns** under Speakers instead.

**Soften breaths**, **Soften S sounds** and **Level each sentence** in the same fold polish the voice itself; see [Video and style](Create-Video-and-Style#sound-polish).

## Level the volume

AI voices come back at a different loudness for every voice and even every request, so a joined narration can jump between quiet and loud. **Level the volume** brings every narration piece (each request, each intro and outro, each speaker's turn) to one loudness before they are joined, then sets the finished video, shorts and audio files to a target loudness. It runs on this computer with no service calls. It is in **Video and style** → **Sound polish** and shows whenever there is narration.

| Option | What it does | Default / range |
| --- | --- | --- |
| **Level the volume** | Turns levelling on or off for this run. A draft that never changed it follows Settings → Production defaults. | On |
| **Video volume** | How loud the finished video and shorts are. 0 dB is −14 LUFS, what YouTube and Spotify play everything at. Peaks always stay under −1.5 dBTP. | 0 dB; −10 to +4 dB in steps of 0.5 |
| **Audio files volume** | How loud the sound-only WAV and an audiobook's MP3 and M4B are. 0 dB is −18 LUFS, the level audiobook shops ask for. Peaks always stay under −3 dBTP. | 0 dB; −10 to +4 dB in steps of 0.5 |

Type each volume in **dB** or as a **%** of the recommended level; the other box follows. −6 dB is about 50% and +4 dB about 158%. The line under each field says the LUFS it stands for. LUFS is how loud a file sounds on average, measured the way ears hear it.

## Silence at the edges and between segments

Both are in **Video and style** → **Sound polish** and only show while there is narration.

| Option | What it does | Default / range |
| --- | --- | --- |
| **Silence at start and end (seconds)** | Quiet time before the narration starts and after it ends. | 2; 0 to 30 |
| **Silence between segments (seconds)** | Quiet between the intro and the narration, and between the narration and the outro. Only matters when an intro or outro is set. Leave it empty to use the gap set in Settings. | Settings value (3 unless changed); 0 to 30 |

## Add a voice under Settings → Voices

The **Voice** list on Create only offers voices you have added.

1. Open Settings → **Voices**.
2. Under **Add a voice**, pick the **Voice service**.
3. Pick a **Voice** from the service's list, or **A voice of my own (paste its ID)** and paste the ID from the service's voice library.
4. Type a **Name** (how you pick it on Create) and, optionally, **Languages it speaks**.
5. Press **Add voice**. The voice joins the table above the form.

On the voice's row in the table, turn on **Sounds like a real person** if it was cloned from, or made to sound like, someone real: Copy for YouTube Studio then answers Yes to YouTube's question about altered or synthetic content for videos it narrates. See [Settings Reference](Settings-Reference#voices) and [Publishing to YouTube](Publishing-to-YouTube).

## What the row says

Folded, the Narration row says who reads it, for example `Read by Ada, an Inworld voice, with the “Welcome” intro.`, or the speakers' format and count. With your own file it names the file.

## Tips

- If a service refuses long requests, set **Split the narration by** to **Paragraph** or **Every 500 words**. The characters charged stay the same.
- Listen to the narration on the project page before publishing. Fix a single piece there instead of making everything again. See [Editing a Project](Editing-a-Project).
- An AI check can listen for missing or garbled passages. See [Reviews and Checkpoints](Reviews-and-Checkpoints).

## Related pages

- [Create Overview](Create-Overview)
- [Multiple Voices](Multiple-Voices)
- [Other Languages](Other-Languages)
- [Narration Aliases and Glossary](Narration-Aliases-and-Glossary)
- [Intros and Outros](Intros-and-Outros)
- [Prompts](Prompts)
- [Keys and Services](Providers-and-Keys)
- [Video and style](Create-Video-and-Style)
