# Pronunciation Glossary skips bad entries

- A glossary entry narration can't use (non-English sounds, ARPAbet, a word-count mismatch, a second different pronunciation, an unreadable line) is now skipped and read as ordinary text, instead of blocking every narration request of the project.
- Table glossaries whose IPA column has no slashes (`| Cleopatra | kliːəˈpætrə |`) are read as IPA.
- The article's Pronunciation tab and the rebuild review list the skipped entries by number and reason, never their text.
- The Use Pronunciation Glossary help says what to ask the article prompt for: slash-delimited standard-English IPA and English approximations for foreign names.
- The rebuild review folds its per-item list into a summary with counts, shows every blocked item's reason (grouped) above Start rebuild, and says next to the button what still keeps it off.
- Projects whose glossary was already valid keep their fingerprints and are not rebuilt.
