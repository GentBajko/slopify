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

See [Inworld's async API](https://docs.inworld.ai/api-reference/ttsAPI/texttospeech/synthesize-speech-async)
for account limits. Both model IDs are bundled; Inworld's LLM catalogue does not list TTS models.
