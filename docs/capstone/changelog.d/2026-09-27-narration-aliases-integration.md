# Narration aliases in dialogue, single spaces, skipped speaker pronunciations

- Narration aliases now reach native multi-speaker requests (ElevenLabs Text to Dialogue): every turn in the request is aliased on its own, the transcript keeps the script's wording, and the request's 2,000-character limit counts the aliased text.
- A multi-word alias (`et al.` → `and others`) no longer leaves two spaces in the text sent to the voice; the whitespace in front of the alias's later words goes with them.
- Multi-voice runs can store their turn requests: the stored work-piece schema now accepts each request's speaker, turn and dialogue lines, which it rejected before.
- Speaker pronunciation rows that are skipped (bad notation, sounds the project's language doesn't use) are named on the Speakers panel as you type, with the entry numbers, the reason and where to fix them, and listed in the rebuild review for speakers on Inworld TTS-2 voices.
- Projects that use multi-word aliases, or aliases in native dialogue turns, see those narration parts as changed once, because the text sent to the voice is now different.
