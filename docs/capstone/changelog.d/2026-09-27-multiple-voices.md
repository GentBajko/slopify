# Multiple voices: audiobook, podcast, radio drama and interview

- Audio → Speakers (Play) and Edit project → Providers → Speakers pick the format and the speakers: name, role, voice, pace and pronunciations, with a priced Audition button that speaks each speaker's first line only when clicked.
- Cast members can have a voice (migration 0034); Speakers → Add from the cast casts them, and each new run takes the member's current voice, so recurring hosts and characters sound the same in every episode.
- A new Script prompt kind (migration 0034) writes speaker turns; an audiobook can instead have the text model split its article into speakers, checked to keep the text's words.
- Narration is one request per turn in the speaker's voice (ElevenLabs Text to Dialogue for consecutive eleven_v3 turns), joined with a gap between turns at each speaker's pace; changing one speaker's voice remakes only their turns.
- Captions carry the speaker (colour, optional name tag, VTT voice spans), never mix two speakers, and podcasts and interviews get a burned-in speaker panel; shorts start and end on turns.
- The Video stage can also make an MP3 and an M4B with chapter markers from the script's sections.
- Runs in the Narration format are unchanged: no recipe, fingerprint or file of theirs moves.
