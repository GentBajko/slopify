# Inworld narration


In Settings, add the **Base64 credentials** from Inworld's API Keys page, then add an
Inworld voice ID (for example `Dennis`, or a voice from your workspace). In Play,
choose **Realtime TTS-2** or **Realtime TTS-2 Flash** and that voice.

Short text streams immediately. TTS-2 text over 4,000 characters uses one async job,
up to 100,000 characters; Inworld caps On-Demand accounts at 10,000. Audio becomes
available once that job finishes. Flash uses streamed parts of at most 4,000 characters.
For longer articles, select paragraph chunking. Successful status checks keep long jobs
alive, and automatic polling/download retries reuse the accepted job. Pausing stops
local requests; Inworld may still finish and bill an accepted job. Resuming after a
pause or app restart starts a new request for unfinished narration.

## Pronunciation Glossary

With **Use Pronunciation Glossary** on, the article's `## Pronunciation Glossary` section
gives names their pronunciation, as `Term: /IPA/` lines or a `| Term | IPA |` table (a
table cell may leave out the slashes). Only standard-English IPA works, one IPA word per
written word, so ask your article prompt for an English approximation of foreign names.
An entry that can't be used (other alphabets or sounds, ARPAbet, a word-count mismatch, a
second different pronunciation for the same term) is skipped and that name is read as
ordinary text; the rest of the glossary still applies. The article's **Pronunciation** tab
and the rebuild review list skipped entries by number and reason; fix them in
**Edit project → Article**.

See [Inworld's async API](https://docs.inworld.ai/api-reference/ttsAPI/texttospeech/synthesize-speech-async)
for account limits. Both model IDs are bundled; Inworld's LLM catalogue does not list TTS models.
