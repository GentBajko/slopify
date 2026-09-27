# Ambient sound under long videos

An optional bed of rain, a fireplace, wind or your own audio file under the whole narration of
the long video. Set it on **Play → Outputs → Export → Ambient sound** (saved with the setup and
its template), or give a channel a default under **Brand kit → Ambient sound** on the channel
page.

## Settings

- **Ambient sound:** *The channel's (brand kit)* (the default: whatever the channel's kit
  says, which may be nothing), *None* (no bed, whatever the channel has), *Rain*, *Fireplace*,
  *Wind* or *My own file*. Rain, Fireplace and Wind are made on this computer by ffmpeg from
  shaped noise, with a fixed seed, so nothing is downloaded and the same settings always sound
  the same. *My own file* uploads an audio file like the shorts' background music; it loops if
  it is shorter than the video.
- **Level (dB):** -40 to -6, whole dB; 0 would be about as loud as a narration. Default -18.
- **Fade in (seconds):** 0 to 30, in steps of 0.5. Default 3.
- **Tail after the narration (seconds):** 0 to 30, in steps of 0.5. Default 6. The bed keeps
  playing after the narration ends and fades out over the tail.

A channel's kit offers the three built-in beds only: an uploaded file belongs to one draft and
its project, and a channel has no file store of its own for audio.

## How it plays

- The bed is **ducked** under the voice by a sidechain compressor keyed by the narration
  itself (the same technique as the shorts' music, slower to come back so it settles rather
  than swelling between sentences). It needs no word timing, so it works with captions, chapters
  and shorts all off, and it dips under an intro and outro too.
- The **tail** plays over the silence already at the end (**Silence at start and end**) and only
  the rest is added: with 2 s of silence and a 6 s tail the video gets 4 s longer; with a tail no
  longer than the silence its length does not change. The end screen sits over the new last
  seconds, so it shows over the tail.
- Only the long video gets it. **Shorts** keep their own background music, and the audio-only
  WAV export (Video Off) stays the narration alone. A bed needs both the video and the narration
  on; otherwise the setting is kept but asks for nothing.

## Projects, templates and schedules

- A project keeps the bed it was started with (the kit is copied into the project's settings);
  editing the channel later changes no project already made. The uploaded file is copied into
  the project and kept with it.
- The bed enters the video render's fingerprint only when it is set, so no project made before
  it, or without one, becomes outdated. Changing any of its settings (or the uploaded file)
  renders the video again, and nothing else.
- A template saved from a project keeps its bed; *My own file* is attached again on Play like
  every other uploaded file. For that reason a template with *My own file* cannot run on a
  schedule; pick a built-in bed for scheduled runs.
- The bed cannot be changed in Edit project yet: start the video again from Play to change it.
