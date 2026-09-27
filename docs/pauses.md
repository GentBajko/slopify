# Pauses between sentences

Some voices run one sentence into the next with barely a breath (Inworld's Realtime TTS-2 is
the one that made this noticeable), so a narration sounds rushed. **Pause between sentences**
sets the least quiet after every sentence; **Pause between paragraphs** optionally sets a longer
one at the end of a paragraph.

| Setting | Range | Default |
| --- | --- | --- |
| Pause between sentences (seconds) | 0 to 2, steps of 0.05 | 0.4 for new runs; 0 keeps the voice's own |
| Pause between paragraphs (seconds) | 0 to 2, steps of 0.05 | 0: paragraphs get the sentence pause |

A rough guide: about 0.25 s is brisk, 0.35 to 0.45 natural or documentary, 0.5 to 0.8 an
audiobook's relaxed pace, 0.8 and up sleep content. The pause between paragraphs is 0 by
default because paragraph pacing is mostly the narration prompt's and the voice's to make; set
it when you want paragraphs to breathe more than sentences.

Set them on **Play → Video and style** beside Level the volume, or in **Edit project → Pauses
and volume**. A template carries them.

## How it works

The pauses are made when the narration pieces are joined, on this computer with ffmpeg, before
the word timing reads the narration:

1. Each piece's text says where its sentences end (and which ends are paragraph ends), as a
   share of its characters.
2. ffmpeg's `silencedetect` finds where the piece's audio is quiet (22 dB under the piece's own
   loudness, held for at least 60 ms).
3. Each sentence end is matched, in order, to the quiet stretch nearest where the words put it,
   preferring a longer stretch (a full stop's pause over a comma's breath). A sentence end with
   no quiet stretch within two seconds (or a fifth of the piece) is left alone rather than
   guessed.
4. A matched stretch shorter than the minimum gets silence added in its middle; between two
   pieces, the end of the first gets whatever the gap lacks. Nothing is removed, so an existing
   pause is never shortened and no word is cut.

Because this happens before the word timing, the captions, the word-by-word highlights, cuts
that follow the narration, the shorts' clips, the YouTube chapters and the M4B's chapter marks
are all timed on the paced narration and stay in step with it. With Level the volume on, the
levelled narration is paced the same way, from the same plan.

In a multi-voice script the pauses apply between sentences inside a speaker's turn; the gap
between turns stays the **Turn gap** under Speakers, and a speaker's pace is taken into account
so the pause comes out at the minimum.

## What it makes again

The pauses are stored on a project only while set (above 0), so every project made before them
keeps its fingerprints. Changing them in Edit project joins the narration again from the pieces
it already has and times it again, which remakes what is timed from it (captions, the video and,
when they are on, the YouTube description and the shorts' pick, which are text-model calls). No
speech is made again.

## Inworld's own pause tags

Inworld's TTS accepts SSML break tags in the text (`<break time="500ms" />`, up to 10 s each,
at most 20 per request, in every language and model, without changing the steering). Slopify
does not rely on them: 20 per request is too few for a chunk of a long article, and the join
approach works the same for every provider.
