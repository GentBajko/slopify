# Remove breaths

Some voices take a loud, audible in-breath after almost every comma and full stop (Inworld's
Realtime TTS-2 is the one that made this noticeable): about a third of a second, only 12 to
15 dB under the words. **Remove breaths** mutes those breaths and nothing else.

| Setting | Default |
| --- | --- |
| Remove breaths | Off |

Set it on **Play → Video and style** beside the pauses between sentences, or in **Edit project
→ Pauses and volume**. A template carries it.

## How it works

The breaths are muted when the narration pieces are joined, on this computer, before the pauses
between sentences are made and before the word timing reads the narration:

1. Each piece is decoded with ffmpeg to 16-bit mono at 48 kHz and read in 20 ms frames, 10 ms
   apart. Each frame gets its level, how often it crosses zero (breath noise crosses often, a
   voiced vowel seldom) and its spectral centroid (where its sound sits: a breath low, an "s" or
   "f" high).
2. The voice's own level is the median of its voiced frames. Every level threshold below is
   relative to it, so a quieter or louder narration (or one Level the volume brought up or
   down) finds the same breaths.
3. A frame is breath-like when it is noisy, under the voice in level but above a whisper (1 to 34 dB
   under the voice) and centred under 2.8 kHz. A run of breath-like frames 140 ms or
   longer is a breath.
4. The breath grows back over the quiet before it until silence, the tail of a voiced word or a
   fricative, and forward over the quiet after it until silence or the next word's voice.
5. Each breath is turned down to -60 dB, with 5 ms fades inside its own stretch, so a fade
   never touches a word.

Nothing is cut out, so every word, the pauses between sentences and the captions stay exactly
where they were; the pauses are still planned from the pieces as spoken. With Level the volume
on, the levelled narration loses the same breaths.

The work runs piece by piece, reads each piece in one-second chunks and gives way to the rest
of the app every two seconds of audio, so Slopify stays responsive while it runs. A three-minute
piece takes about a second and a half.

## What it makes again

The setting is stored on a project only while on, so every project made before it keeps its
fingerprints. Turning it on or off in Edit project joins the narration again from the pieces it
already has and times it again, which remakes what is timed from it (captions, the video and,
when they are on, the YouTube description and the shorts' pick, which are text-model calls). No
speech is made again.
