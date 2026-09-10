# Inworld narration and subtitle positions

Adds Inworld TTS-2 and TTS-2 Flash to Settings, model selection, voices and narration. TTS-2 uses async synthesis above 4,000 characters, accepting up to 100,000 per job subject to account limits. Status activity extends the idle deadline and a per-call continuation prevents duplicate submission during automatic polling/download retries. Flash streams bounded text parts.

Adds five persisted subtitle positions, shared preview/render geometry, font and size preview beside controls in the actual output aspect ratio, and landscape/portrait format buttons. Existing projects default to bottom and reuse alignment for style changes.

Release 0.7.0 also includes the previously completed model catalogue, project workspace, live previews and app updater changes. Website and package documentation describe the final release.

Sources: https://docs.inworld.ai/tts/tts-models ; https://docs.inworld.ai/api-reference/ttsAPI/texttospeech/synthesize-speech-stream ; https://docs.inworld.ai/api-reference/ttsAPI/texttospeech/synthesize-speech-async ; https://docs.inworld.ai/api-reference/ttsAPI/texttospeech/get-async-operation .
