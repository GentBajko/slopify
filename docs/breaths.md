# Soften breaths and Soften S sounds

Some voices take a loud, audible in-breath after almost every comma and full stop (Inworld's
Realtime TTS-2 is the one that made this noticeable): about a third of a second, only 12 to
15 dB under the words. **Soften breaths** turns those breaths down and leaves everything else
as it was. **Soften S sounds** takes the sharp edge off s and sh sounds with a very light
de-esser. The two are separate switches and work with or without each other.

| Setting | Config field | Default |
| --- | --- | --- |
| Soften breaths | `removeBreaths` (its 3.19.0 name, kept so saved projects keep it) | Off |
| Soften S sounds | `deEss` | Off |

Set them on **Play → Video and style** beside the pauses between sentences, or in **Edit
project → Pauses and volume**. A template carries them.

## How Soften breaths works

The breaths are softened when the narration pieces are joined, on this computer, before the
pauses between sentences are made and before the word timing reads the narration:

1. Each piece is decoded with ffmpeg to 16-bit mono at 48 kHz and read in 20 ms frames, 10 ms
   apart. Each frame gets its level, how often it crosses zero (breath noise crosses often, a
   voiced vowel seldom) and its spectral centroid (where its sound sits: a breath low, an "s" or
   "f" high).
2. The voice's own level is the median of its voiced frames. Every level threshold below is
   relative to it, so a quieter or louder narration (or one Level the volume brought up or
   down) finds the same breaths. The thresholds were approved by ear on a finished video's
   audio, whose voice level is -17.26 dB; the dB values below are at that level.
3. A frame is breath-like when it is noisy, under the voice in level but above a whisper (-55 to -22 dB, so
   4.7 to 37.7 dB under the voice) and centred under 2.8 kHz. A run of breath-like frames 140 ms or
   longer is a breath.
4. The breath grows back over the quiet before it until silence, the tail of a voiced word or a
   fricative, and forward over the quiet after it until silence or the next word's voice.
5. **Guard.** The stretch is cut into 10 ms blocks. If any block is louder than -26 dB (8.74 dB
   under the voice's own level), the stretch holds part of a word and is left completely
   untouched.
6. Every other breath is turned down by 12 dB (to a quarter of its level), with 45 ms linear
   fades inside its own stretch: down over its first 45 ms and back up over its last 45 ms, so a
   fade never touches a word and nothing drops off abruptly. A stretch of 90 ms or less is left as
   it is.

Nothing is cut out, so every word, the pauses between sentences and the captions stay exactly
where they were; the pauses are still planned from the pieces as spoken. With Level the volume
on, the levelled narration loses the same breaths.

The work runs piece by piece, reads each piece in one-second chunks and gives way to the rest
of the app every two seconds of audio, so Slopify stays responsive while it runs. A three-minute
piece takes about a second and a half.

### What changed from 3.19.0

3.19.0 shipped this as **Remove breaths**: it muted every detected breath to -60 dB with 5 ms
fades. On a full 2.5-hour narration some detected stretches held word sounds (up to -13 dB), so
word edges were clipped ("Highs" came out as "Hi…s"), and the hard drops to silence sounded
abrupt. The guard, the 12 dB depth and the 45 ms fades replace it. A project that had it on
joins its narration again once (its fingerprint value moved from `breaths-v1` to
`breaths-v2`); no speech is made again.

## How Soften S sounds works

When it is on, each narration piece in the join goes through ffmpeg's `deesser` filter at
`i=0.35:m=0.5:f=0.5` (a light intensity, ffmpeg's default ceiling and frequency), after Soften
breaths and before the pauses. It is one ffmpeg run per piece, on this computer, and the piece
keeps its length.

## What it makes again

Each setting is stored on a project only while on, so every project made before them keeps its
fingerprints. Turning either on or off in Edit project joins the narration again from the pieces
it already has and times it again, which remakes what is timed from it (captions, the video and,
when they are on, the YouTube description and the shorts' pick, which are text-model calls). No
speech is made again.
