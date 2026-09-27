# Level the volume (loudness normalization)

Text-to-speech comes back at a different loudness for every voice, and even for every request
of the same voice, so a joined narration used to jump between quiet and loud. **Level the
volume** fixes that in two steps, both on this computer with the bundled ffmpeg, no API calls:

1. **Every narration piece is levelled before the join.** Each chunk of a single voice, each
   intro and outro part, and each speaker's turn of a multi-voice script is measured with the
   first pass of ffmpeg's `loudnorm` (integrated loudness, range, true peak, threshold) and
   brought to one common loudness, −20 LUFS, by the one fixed gain `loudnorm`'s linear mode
   would apply, so the voice keeps its own dynamics. A piece too short or quiet to measure (under
   about 0.4 s, or below −70 LUFS) is left as it is. −20 LUFS leaves room for a voice's peaks,
   which run 14 to 18 dB over its loudness; the master lifts the whole afterwards.
2. **Every finished file is mastered to a target** the same way. The long video and the shorts
   are brought to the video volume (default −14 LUFS, peaks under −1.5 dBTP: the loudness
   YouTube and Spotify play everything at). The audio files (the audio-only WAV when Video is
   off, and a multi-voice run's MP3 and M4B) are brought to the audio files volume (default
   −18 LUFS, peaks under −3 dBTP, what audiobook shops ask for). The ambient bed and the shorts'
   music are mixed first and ducked by the levelled voice, so they keep their place under it;
   the master then sets the whole mix.

**How the gain and the peaks are handled.** Where the gain would push the peaks over the
ceiling, a limiter running at 192 kHz (four times the usual rate, so it sees the peaks between
the samples) holds just those peaks. `loudnorm`'s own second pass is not used: it cannot stay
linear on anything shorter than its 3-second window (a line like "said the Mole." is 1.3 s),
and wherever the peaks do not allow one gain it rides the whole level down, landing a piece or a
video 1 to 2 LU short. A file the limiter trimmed more than 0.2 LU under the level gets its gain
corrected once. The master aims 1 dB under each ceiling, because the lossy encode after it (AAC,
MP3) lifts the peaks by up to about 0.7 dB, and what is reported is measured on the finished
file.

LUFS is how loud a file sounds on average, measured the way ears hear it (EBU R128). The style
preview is silent, so it has nothing to level.

## Where to set it

- **Settings → General → Level the volume for new runs**: the app-wide default. On, at the
  recommended volumes, unless you change it. Play, templates, the quick short and every new
  draft start from it.
- **Play → Outputs → Export → Level the volume**: this run's own choice. A draft that never
  touched it follows Settings.
- **Edit project → Pauses and volume**: turn it on or off for a project, or change the volumes.

Each volume is typed in **dB from the recommended level** (0 dB is −14 LUFS for the video,
−18 LUFS for the audio files) or as a **percentage** of it: −6 dB is about 50%, +4 dB about 158%.
The range is −10 dB to +4 dB in steps of 0.5 dB; the peak ceilings above always hold, so a
louder setting is limited rather than clipped. One number is stored: the target in LUFS.

## What it makes again

The setting is stored on a project only while it is on, so every project made before it (and
every one with it off) keeps its fingerprints and is not outdated by this release.

The plain join of the narration is kept as it was, and the word timing keeps reading it; the
levelled narration is a join of its own beside it (`level:intro`, `level:body`, `level:outro`),
which the exports play. So turning the setting on in Edit project joins the narration again from
the pieces it already has, levelled, and exports again: **no speech is made again**, and the
word timing, the YouTube description, the shorts' pick and prompts, and the reviews are not
redone either. Changing only a volume masters the exports again without joining again.

The Narration section plays the levelled narration once it exists and says what the levelling
did, for example *Levelled 24 pieces to −20 LUFS: the spread was 7.2 LU, now 0.2 LU.* The Video
section's file line says what the master measured: *Mastered to −14 LUFS: measured −14.1 LUFS,
peaks −1.6 dBTP.*

## Uploaded narration

An uploaded narration (Narration → Provide) is your own file: it is never levelled piece by
piece and is kept byte for byte. While Level the volume is on, only the exports' master reaches
it, so the video and audio files come out at the chosen volume. Turn Level the volume off for
the project to keep the exports at the file's own level.
