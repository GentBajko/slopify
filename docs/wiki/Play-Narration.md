# Play Narration

The narration is the article read aloud by a text-to-speech (TTS) voice. On Play you pick the service, model and voice, and fine-tune how the text is prepared, split, paced and levelled. You get a narration track that the captions, cuts, chapters and shorts are all timed from.

**Where to find it:** Play → **Narration** row → **Change**. The pauses, the volume levelling and the silences sit in Play → **Video and style**, and **Show tables and figures on screen** sits in Play → **Outputs**; they are described here because they shape the narration.

## Choose where the narration comes from

The Narration row starts with a **Source** switch:

| Source | What happens | Cost |
| --- | --- | --- |
| **Generate** (default) | A TTS voice reads the article aloud. | Charged by the provider per character |
| **Provide** | Uses an audio file you upload (**Narration file**), as it is. | None |
| **Off** | Makes a silent video with no captions, YouTube description or shorts. The row reads "Off, a silent video". | None |

With **Provide**, the file is used as is: "Uploaded narration is used as-is; include any intro and outro in that file." It is never levelled piece by piece; only the final master reaches it when **Level the volume** is on.

## Pick a voice

1. Open the **Narration** row and leave **Source** on **Generate**.
2. Pick the **TTS** provider. A greyed provider says why it cannot be used; add its key under Settings.
3. Pick the **TTS model**.
4. Pick a **Voice**. If the list says "No voices. Add one in Settings.", add a voice first (see [Add a voice](#add-a-voice-under-settings--voices)).

| Option | What it does | Default |
| --- | --- | --- |
| **TTS** | The text-to-speech service, charged per character of text. Changing it clears the model and voice. | Your Settings default |
| **TTS model** | The provider's speech model. Models differ in quality, languages, speed and price per character. Narration Preparation needs Inworld TTS-2. The refresh button asks the provider for its current list; **Custom ID** lets you type one. | Your Settings default |
| **Voice** | Who reads the narration: the voices you added under Settings → Voices for this provider, filtered to the project's language. With several speakers, this voice reads the intro and outro. | None |
| **Show all voices** | The voice list hides voices listed for other languages than the project's. Tick this to pick one anyway, for example a multilingual voice whose languages are listed wrong. The label says how many are hidden. A voice with unknown languages is always shown. | Off |

### Several speakers

Under the voice is a **Speakers** disclosure. It reads "Narration, one voice" by default. Open it to pick an audiobook, podcast, radio drama or interview format with several speakers, each with their own voice. See [Multiple Voices](Multiple-Voices) for every speaker setting, and [Other Languages](Other-Languages) for narrating in another language.

## Audio Advanced

**Audio Advanced** is a disclosure under the voice. Its line says what is not at the default, for example `words · intro Welcome · glossary on`.

### Chunking

How the narration is split into TTS requests. Split it when a provider refuses long text. It changes the number of requests, not the characters charged.

| Option | What it does | Default |
| --- | --- | --- |
| **Chunking** | **Whole** sends the narration in one request. **Paragraph** sends one per paragraph. **Every N words** or **Every N characters** ends each request at a sentence end. | **Whole** |
| **Words** / **Characters** (chunk size) | How long each request may be. Each request ends at the last whole sentence that fits, so a single longer sentence stays whole. Characters count spaces. | 500 words, or 3000 characters |

Up to 10,000 words or 1,000,000 characters per chunk.

### Intro and outro

**Intro** and **Outro** pick Library entries read before and after the article. See [Play Title and Article](Play-Title-and-Article#intro-and-outro) and [Intros and Outros](Intros-and-Outros).

### Narration Preparation

Has the text model add delivery directions and sounds, such as a sigh or a laugh, following the Library narration prompt you pick. The article and captions stay unchanged.

| Option | What it does | Default |
| --- | --- | --- |
| **Narration Preparation** | Pick a narration prompt from the Library, or **Off**. One text-model call per narration chunk and per intro or outro entry. | Off |

It needs the Inworld TTS-2 model. With another model, the field says "Choose Inworld TTS-2 or turn preparation Off." With several speakers, at least one speaker must use Inworld TTS-2. When preparation is on, the row offers **Choose text generation under Article** to jump to the text model.

### Pronunciation Glossary

| Option | What it does | Default |
| --- | --- | --- |
| **Use Pronunciation Glossary** | Reads names with the IPA in the article's Pronunciation Glossary, such as `Arda: /ˈɑɹdə/`, with no extra text-model call. Works with Inworld TTS-2 and TTS-2 Flash. The written text stays unchanged. | On |
| **Also use pronunciations from my other projects** | Adds every term from your other projects' glossaries, copied when this project starts. This project's own glossary wins where they differ. Turn it off to use only this article's glossary. | On |

With another provider or model the switch is greyed and says "Unavailable for this provider or model. Your saved preference is retained."

To get a glossary, ask for one in your article prompt: a section in slash-delimited standard-English IPA, one `Term: /IPA/` per line, with an English approximation for foreign names. A line with sounds English lacks is read as plain text. The glossary is never narrated itself. See [Narration Aliases and Glossary](Narration-Aliases-and-Glossary).

### Narration aliases

| Option | What it does | Default |
| --- | --- | --- |
| **Use narration aliases** | Says the words listed in Library → Aliases the way they are written there, such as `Dr.` as `Doctor`, with any generated voice. They are copied when the project starts. The article and captions keep the written words. | On |

Manage the list in [Narration Aliases and Glossary](Narration-Aliases-and-Glossary).

### Tables, figures and code

An article written to be read can contain tables, pictures, equations and code. Read aloud cell by cell or symbol by symbol, they are noise.

| Option | What it does | Default |
| --- | --- | --- |
| **Describe tables and figures in the narration** | The text model writes a short spoken passage for each table, picture, equation and code block (a table's pattern, what a figure or equation means, what code does), and the narration says it in its place. One extra text-model call per block, in the estimate and kept for reuse. The article and PDF keep the real table; captions show what is said. Needs a text model. | On |
| **Leave code out** | Shown under the switch above. Drops code blocks from the narration instead of summarising each in a sentence or two. Tables, figures and equations are still described. | Off |
| **Show tables and figures on screen** (in the **Outputs** row) | Each block the narration describes is also shown in the video while it is described: the article's own picture for a figure, a card drawn in your brand kit's title font and colour for the rest. The images take turns around them, and Shorts that include one show it upright. Drawn on this computer at no cost. Offered while the narration describes tables and figures. | On |

Even with the switch off, some things are handled for you: links are read without their address, and footnote markers, the Sources Consulted section and the Pronunciation Glossary are never narrated.

## Pauses between sentences and paragraphs

Some voices run one sentence into the next with barely a breath. These settings add quiet where the voice's own pause is shorter. They never shorten a pause or cut a word, and the captions follow. They are in the **Video and style** row, beside **Level the volume**, and only show while the narration is generated.

| Option | What it does | Default / range |
| --- | --- | --- |
| **Pause between sentences (seconds)** | The least quiet after each sentence. About 0.25 s is brisk, 0.35 to 0.45 natural or documentary, 0.5 to 0.8 an audiobook's relaxed pace, 0.8 and up sleep content. 0 keeps the voice's own. | 0.4; 0 to 2 in steps of 0.05 |
| **Pause between paragraphs (seconds)** | The least quiet at the end of a paragraph, when you want more than between sentences. Try 0.8 to 1.2 for a slower read. 0 gives paragraphs the sentence pause. | 0; 0 to 2 in steps of 0.05 |

The pauses are added on this computer before the word timing, so the captions, cuts, shorts and YouTube chapters stay in step. With several speakers, the gap between turns is **Gap between turns** under Speakers instead.

## Level the volume

TTS comes back at a different loudness for every voice and even every request, so a joined narration can jump between quiet and loud. **Level the volume** brings every narration piece (each chunk, each intro and outro, each speaker's turn) to one loudness before they are joined, then sets the finished video, shorts and audio files to a target loudness. It runs on this computer with no API calls. It is in the **Video and style** row and shows whenever there is narration.

| Option | What it does | Default / range |
| --- | --- | --- |
| **Level the volume** | Turns levelling on or off for this run. A draft that never changed it follows Settings → General. | On |
| **Video volume** | How loud the finished video and shorts are. 0 dB is −14 LUFS, what YouTube and Spotify play everything at. Peaks always stay under −1.5 dBTP. | 0 dB; −10 to +4 dB in steps of 0.5 |
| **Audio files volume** | How loud the audio-only WAV and an audiobook's MP3 and M4B are. 0 dB is −18 LUFS, the level audiobook shops ask for. Peaks always stay under −3 dBTP. | 0 dB; −10 to +4 dB in steps of 0.5 |

Type each volume in **dB** or as a **%** of the recommended level; the other box follows. −6 dB is about 50% and +4 dB about 158%. The help line under each field says the LUFS it stands for. LUFS is how loud a file sounds on average, measured the way ears hear it.

## Silence at the edges and between segments

Both are in the **Video and style** row and only show while there is narration.

| Option | What it does | Default / range |
| --- | --- | --- |
| **Silence at start and end (seconds)** | Quiet time before the narration starts and after it ends. | 2; 0 to 30 |
| **Silence between segments (seconds)** | Quiet between the intro and the narration, and between the narration and the outro. Only matters when an intro or outro is set. Leave it empty to use the gap set in Settings. | Settings value (3 unless changed); 0 to 30 |

## Add a voice under Settings → Voices

The **Voice** list on Play only offers voices you have added.

1. Open Settings → **Voices**.
2. Fill in **Voice name**, **Provider**, **Voice ID** and, optionally, **Languages**.
3. Press **Add voice**. The voice joins the table above the form.
4. Optional: tick **Real person** on the voice's row in the table if it imitates a real person.

| Field | What it does |
| --- | --- |
| **Voice name** | The name you pick this voice by on Play and in Edit project. Only you see it. |
| **Provider** | The TTS service the voice ID belongs to. Only providers set up under Settings are listed. |
| **Voice ID** | The provider's own id for the voice, copied from its voice library. It is not checked now; a wrong id fails when a run's narration uses it. |
| **Languages** | The languages the voice speaks, as codes such as `es`, `de`. Play lists the voice only for projects in these languages. Blank asks the provider when it can say; a voice with unknown languages is offered for every language. |
| **Real person** | Turn on for a voice cloned from, or made to sound like, a real person. Prepare upload then answers Yes to YouTube's AI use question for videos it narrates. An AI voice that imitates no one stays off. |

See [Settings Reference](Settings-Reference) and [Publishing to YouTube](Publishing-to-YouTube).

## What the row summary says

Folded, the Narration row shows the provider and voice (or the speakers format and count), and any preparation prompt, intro and outro, for example `Inworld · Ada · intro Welcome`. With Provide it shows your file's name.

## Tips

- If a provider refuses long requests, switch **Chunking** to **Paragraph** or **Every 500 words**. The characters charged stay the same.
- Listen to the narration on the project page before publishing. Fix a single chunk there instead of re-running everything. See [Editing a Project](Editing-a-Project).
- An automatic review can check the narration for missing or garbled passages. See [Reviews and Checkpoints](Reviews-and-Checkpoints).

## Related pages

- [Play Overview](Play-Overview)
- [Multiple Voices](Multiple-Voices)
- [Other Languages](Other-Languages)
- [Narration Aliases and Glossary](Narration-Aliases-and-Glossary)
- [Intros and Outros](Intros-and-Outros)
- [Prompts](Prompts)
- [Providers and Keys](Providers-and-Keys)
- [Play Video and Style](Play-Video-and-Style)
