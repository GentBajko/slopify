# Level the volume (loudness normalization)

- Every narration piece (a chunk, an intro or outro part, a speaker's turn) is measured and brought to −18 LUFS with ffmpeg's two-pass loudnorm before the pieces are joined, so voices and requests no longer jump in loudness; the Narration section says what it did ("the spread was 7.2 LU, now 0.4 LU").
- The long video and the shorts are mastered to −14 LUFS (peaks under −1.5 dBTP), the audio-only WAV and the MP3/M4B to −18 LUFS (peaks under −3 dBTP); the ambient bed and shorts music stay ducked under the levelled voice.
- Volumes are set in dB from the recommendation or as a percentage (−10 dB to +4 dB) in Settings → General (the default for new runs, on), Play's Export row and Edit project → Volume.
- The levelled narration is its own join beside the plain one (`level:*`), so turning it on in Edit project makes no speech, word timing, description, shorts pick or review again; projects made before it keep their fingerprints (the setting is stored only while on).
- Uploaded narration is never re-levelled; only the exports' master reaches it while the setting is on.
