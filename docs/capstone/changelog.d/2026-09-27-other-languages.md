# Projects in other languages

- A **Language** picker on Play, in Edit project and on a channel's brand kit (the language of its new projects); templates keep the language their draft had. English projects are unchanged and are not re-run.
- The article, narration preparation, YouTube description, chapters, tags, Shorts titles and multi-voice scripts are written in the project's language: Slopify adds one line after your prompt and never edits the prompt itself.
- Captions in Spanish, German, French, Italian, Portuguese, Dutch, Catalan, Polish and Czech are timed word by word with a free multilingual model (248 MB, Apache-2.0), downloaded the first time a project in one of them makes captions, with numbers spelled in the language. Other languages are timed sentence by sentence, with word-by-word Shorts captions and cuts that follow the narration turned off, and the project page says so.
- Voices carry the languages they speak: asked of ElevenLabs, Cartesia and Inworld when a voice is added, or typed in Settings → Voices. Play lists the voices for the project language, with Show all voices, and warns when the chosen voice is listed for another language.
- The pronunciation glossary accepts full IPA in other languages, and captions fall back to a bundled Noto Sans font (Latin, Greek, Cyrillic, Arabic, Hebrew, Devanagari, Thai) when the chosen font lacks the language's letters.
- `scripts/validate-multilingual-alignment.mjs` aligns a local recording against its text and prints the timing quality.
