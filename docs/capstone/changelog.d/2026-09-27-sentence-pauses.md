# Pauses between sentences

- New runs lengthen the quiet after every sentence to at least 0.4 s (Pause between sentences, 0 to 2 s), with an optional longer Pause between paragraphs (0 by default), set on Play's Export row or in Edit project → Pauses and volume.
- The pauses are added in the narration join, in the middle of the quiet each sentence already ends with (found by silencedetect and the text's sentence ends), never shortening a pause or cutting a word; the word timing runs afterwards, so captions, highlights, cuts, shorts, chapters and M4B marks stay in sync.
- Multi-voice scripts get them inside a speaker's turn; the turn gap stays separate. Projects made before them keep their fingerprints (stored only while set).
