# Other Languages

A project can be written and narrated in one of 30 languages, not only English. Slopify asks the text model to write the article, description and shorts titles in that language, lists the voices that speak it, and times the captions for it. English and nine other languages get word-by-word captions; the rest are timed sentence by sentence.

**Where to find it:** Play → **Channel** row → **Language**. On a finished project: Edit project → **Providers** → **Language**. For a channel's default: Channels → the channel → **Brand** → **Language of new projects**.

## Pick a language for one video

1. On Play, open the **Channel** row.
2. Under **Language**, pick the language. The first option, **Channel's language (…)**, uses the channel's language and names it.
3. Open the **Narration** row and pick a **Voice** that speaks the language. The list only shows voices listed for that language, plus voices whose languages are unknown.
4. Read the line under the Language picker: it says what is written in the language and how the captions will be timed.
5. Start the run.

A template saves the language its draft had. A draft that never picked one uses its channel's language, and English if the channel has none.

## Set a channel's language

1. Open **Channels**, pick the channel and open its **Brand** tab.
2. Under **Language of new projects**, pick the language. **Not set** means English.

This applies with the brand kit off too, because language is not styling. Projects already made keep their language.

## Change the language of a finished project

1. Open the project and press **Edit project**.
2. Open **Providers** and pick the new **Language**.
3. Save. Changing the language re-writes the project's text and re-times its captions; the rebuild review shows what will be remade and what it costs.

## What changes with the language

| | English | Spanish, German, French, Italian, Portuguese, Dutch, Catalan, Polish, Czech | All other languages |
|---|---|---|---|
| Article, narration preparation, YouTube description, chapters, tags, shorts titles and hashtags, multi-voice scripts | English | Written in the language | Written in the language |
| Caption timing | Word by word, English model (95 MB) | Word by word, multilingual model (248 MB, downloaded once, on first use) | Sentence by sentence, no model |
| Word-by-word Shorts captions | On | On | Off: shorts show whole caption groups |
| Cuts that follow the narration | Available | Available | Off: cuts fall every N seconds |
| Pronunciation Glossary | Standard-English IPA | Full IPA (ç, ʁ, ø, y, ɲ, x and so on) | Full IPA |
| Caption font | As chosen | As chosen, or bundled Noto Sans if the font lacks the letters | See [Caption fonts](#caption-fonts) |

### The 30 languages

| Timing | Languages |
|---|---|
| Word by word (English model) | English |
| Word by word (multilingual model) | Spanish, German, French, Italian, Portuguese, Dutch, Catalan, Polish, Czech |
| Sentence by sentence | Romanian, Swedish, Danish, Norwegian (bokmål), Finnish, Hungarian, Turkish, Indonesian, Vietnamese, Greek, Russian, Ukrainian, Arabic, Hebrew, Hindi, Thai, Japanese, Chinese, Korean |

The picker shows each language by its own name and its English name, for example **Deutsch · German**.

## How the writing works

Your prompts are not edited. When a project is not in English, Slopify adds one line of its own after your prompt telling the model to write everything meant for the audience (article, narration, titles, descriptions, chapter names, hashtags and tags) in the chosen language, even where your prompt is in English. The line tells the model to keep headings your prompt asks for, such as **Pronunciation Glossary** and **Sources Consulted**, exactly as written, because Slopify finds the end of the article by those headings.

Image prompts stay in English: image models read English best.

English projects get no extra line, so they are exactly what they were before languages existed.

## Voices and languages

Saved voices carry the languages they speak.

1. Open **Settings → Voices** and add a voice.
2. Leave **Languages** blank and Slopify asks ElevenLabs, Cartesia or Inworld which languages the voice speaks, or type codes yourself, such as `es, de`.
3. Press **Edit** in the Languages column to change them later.

OpenAI has no voice API for this, and its voices read every language its model does. A voice whose languages are unknown is offered for every language.

On Play, the voice list shows the voices that speak the project language. Tick **Show all voices** to pick one listed for other languages, for example a multilingual voice whose languages are listed wrong. If you pick such a voice, Play warns you but does not stop the run. Speaker voice pickers under Speakers, and a cast member's voice picker, filter the same way. See [Multiple-Voices](Multiple-Voices).

## Caption timing in detail

- **English** uses its own model, as before.
- **The nine word-by-word languages** use a free multilingual model, about 248 MB. It is downloaded the first time a project in one of these languages makes captions, into your data folder, and checked before use. It is never downloaded at start-up and is not part of the Docker image. Numbers are spelled out in the language before timing. A word written in another alphabet stops the captions with a message asking you to write it in Latin letters. Allow about 1.1 GB of memory for captions in these languages, against about 0.8 GB for English.
- **All other languages** are timed sentence by sentence: Slopify finds the narration's pauses from its loudness and lays each sentence over its share of the speech. Nothing is downloaded. The project page says so under the video.

Because word timing is not available in the sentence-timed languages, two features are off there, and the controls say so:

- **Cuts** set to **Follow the narration** fall back to every N seconds (Seconds per image).
- **Shorts** show whole caption groups instead of word-by-word captions.

Chinese, Japanese and Thai words are counted with the platform's word breaker when narration is split into chunks.

## Caption fonts

For any language other than English, Slopify checks that your caption font has the language's letters. If it doesn't:

1. It uses a bundled Noto font for Latin, Greek, Cyrillic, Arabic, Hebrew, Devanagari and Thai.
2. For Chinese, Japanese and Korean, which are not bundled (their fonts run to 10-20 MB), it looks for a font on your computer that has the letters.
3. If none is found, the Video stage stops and says so. Upload a font that has the letters with **Upload font (.ttf or .otf)** in the caption font picker (Play → **Video and style**, or Edit project → **Subtitles**), choose it, then press **Try again**. Noto Sans JP, KR or SC from fonts.google.com work.

English projects always render with exactly the font you chose.

## Limits

- Only the 30 languages above can be picked.
- Word-by-word captions and cuts that follow the narration are only available in English and the nine multilingual languages.
- The first captions in a multilingual language need a one-time download of about 248 MB.
- Some voice providers list languages incorrectly; use Show all voices if the voice you want is missing.

## Related pages

- [Play-Narration](Play-Narration)
- [Play-Video-and-Style](Play-Video-and-Style)
- [Channels](Channels)
- [Multiple-Voices](Multiple-Voices)
- [Shorts](Shorts)
- [Narration-Aliases-and-Glossary](Narration-Aliases-and-Glossary)
- [Editing-a-Project](Editing-a-Project)
- [Where-Your-Files-Live](Where-Your-Files-Live)
