# Projects in other languages

A project can be made in a language other than English. Pick it under **Language** on Play
(below the channel), in **Edit project → Providers**, or as a channel's **Language of new
projects** in **Channels → Brand**. A template saves the language its draft had. A draft that
never picked one uses its channel's language, else English. English projects are exactly what
they were before languages existed: nothing is stored for them and no English project is
re-run.

## What changes with the language

| | English | es, de, fr, it, pt, nl, ca, pl, cs | Other languages in the list |
|---|---|---|---|
| Article, narration preparation, YouTube description, chapters, tags, Shorts titles and hashtags, multi-voice scripts | English | Written in the language | Written in the language |
| Sentence splitting and narration chunks | Unicode rules | Unicode rules | Unicode rules; Chinese, Japanese and Thai words are counted with the platform's word breaker |
| Word timing (captions, SRT/VTT, chapters, Shorts clips) | Word by word, English model (95 MB) | Word by word, multilingual model (248 MB, downloaded on first use) | Sentence by sentence, no model |
| Word-by-word Shorts captions, cuts that follow the narration | On | On | Off: Shorts show whole caption groups, cuts fall every N seconds |
| Pronunciation glossary | Standard-English IPA | Full IPA (ç, ʁ, ø, y, ɲ, x, …) | Full IPA |
| Caption font | As chosen | As chosen, or bundled Noto Sans if the font lacks the letters | Bundled Noto for Latin, Greek, Cyrillic, Arabic, Hebrew, Devanagari and Thai; a font on the computer for Chinese, Japanese and Korean, or upload one |

**The prompts themselves are not edited.** Slopify adds one line of its own after your prompt
("write everything meant for the audience in Spanish…"), so a prompt written in English still
produces a Spanish article. The line keeps headings the prompt asks for (such as
"Pronunciation glossary" and "Sources consulted") as written, because Slopify finds the end
matter by those headings. Image prompts stay in English: image models read English best.

**Voices.** Saved voices carry the languages they speak. When a voice is added in
**Settings → Voices**, Slopify asks ElevenLabs, Cartesia or Inworld which languages it speaks,
or you type codes (`es, de`); **Edit** in the Languages column changes them later. OpenAI has
no voice API (its voices read every language its model does), and a voice whose languages are
unknown is offered for every language. Play lists the voices that speak the project language,
with **Show all voices** to see the rest, and warns (without stopping the run) when the chosen
voice is listed for other languages.

## Word timing

- **English** keeps `Xenova/wav2vec2-base-960h` (Apache-2.0), its constants and its fingerprints
  (`wav2vec2-en-a19f851-v2-omissions`).
- **Spanish, German, French, Italian, Portuguese, Dutch, Catalan, Polish and Czech** use
  `voidful/wav2vec2-xlsr-multilingual-56` (Apache-2.0) as converted to ONNX by NewComer00, the
  4-bit file `onnx/model_q4.onnx` at revision `2d48b01b6429d9018f81914550565112d56f6ba7`
  (247,576,761 bytes, SHA-256 `fcf93903…0ceb577`, pinned in `adapters/alignment/multilingual.ts`).
  It is downloaded the first time a project in one of these languages makes captions, into
  `<data-dir>/models/multilingual-subtitles/`, with the same three retries, progress and hash
  check as the English model. It is never downloaded at start-up or baked into the Docker image.
  The 9,913-label vocabulary is folded to the language's own letters (a–z plus its accented
  letters, both cases summed), so the aligner works on about 35 labels as it does for English.
  Numbers are spelled in the language (`adapters/alignment/spell.ts`: years like
  "neunzehnhundertneunzig", "1.000" as a thousand, "3,5" as three point five), and letters from
  other Latin alphabets are read without their accents. A word in another alphabet stops the
  captions with a message to write it in Latin letters.
- **Other languages** are timed sentence by sentence: the narration's pauses are found from its
  loudness and each sentence is laid over its share of the speech, moved to the nearest pause.
  Nothing is downloaded. The project page says so under the video.

The timing's operation id is the model's (`wav2vec2-xlsr56-2d48b01-v1`,
`sentence-timing-v1`), so changing a project's language re-times its captions and re-writes
its text, and nothing else.

MMS (`MahmoudAshraf/mms-300m-1130-forced-aligner`, `facebook/mms-*`) was ruled out: its licence
is CC-BY-NC-4.0, and Slopify (Apache-2.0) makes videos for monetisable channels.

### Validation (2026-09-27)

`packages/app/scripts/validate-multilingual-alignment.mjs` aligns a local recording against its
text and prints the timing quality; `--transcribe` prints what the model hears. It was run on
LibriVox excerpts (public domain) against their Project Gutenberg texts, on a 16-thread x86-64
desktop:

| Recording | Model | Audio | Words | Time | Peak memory | Mean word confidence | Words after a pause: start drift (median / mean) |
|---|---|---|---|---|---|---|---|
| *Alice's Adventures in Wonderland*, ch. 1 (en) | English | 57 s | 147 | 2.3 s | 808 MiB | 0.96 | 0.04 s / 0.08 s |
| *Lazarillo de Tormes*, prologue (es) | multilingual q4 | 64 s | 193 | 3.4–6.9 s | 1,013 MiB | 0.95 | 0.02 s / 0.02 s |
| *Die Verwandlung*, ch. 1 (de) | multilingual q4 | 48 s | 102 | 2.4–2.7 s | 1,021 MiB | 0.97 | 0.04 s / 0.04 s |

Every word was aligned, none fell below 0.2 confidence, and German text against the Spanish
recording was refused at its first window. So the multilingual model uses the English gates
unchanged. As in English, a short phrase in the text that the narration skips is squeezed in
rather than reported; a longer one stops with the usual mismatch message. The sentence
fallback, run on the same recordings, put sentence starts within 0.3–0.5 s of the model's
(median), with one German sentence 4 s off, which is why word-by-word features are off there.
Peak memory counts the script and the alignment worker together; allow about 1.1 GB for
captions in these languages, against about 0.8 GB for English.

Not measured: Italian, Portuguese, French, Dutch, Catalan, Polish and Czech narration, TTS
voices (rather than human readers), and the WebAssembly fallback on Intel Macs.
