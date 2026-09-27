# Multiple voices: portraits, cast voices on every start, speakers of edited captions

- The podcast and interview speaker panel shows a cast member's picture in their tile when they have one (scaled and cropped square under the lit outline); speakers without one keep their initials. Projects without pictures keep their caption and render fingerprints.
- Cast speakers take the cast's current voice, pace and pronunciations on every start path: Play, a Play batch, a schedule, and drafts sent to `POST /api/projects` and `POST /api/projects/batch` (the two API routes did not before).
- Captions edited by hand keep each cue's speaker through edits of its text and timing; new cues take the speaker of the narration under them.
- A test runs the real bundled ffmpeg over sine-tone turns: the turn join with pace and gaps, the MP3 and M4B with chapters, and a portrait laid into its panel tile.
