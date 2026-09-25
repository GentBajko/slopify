# Motion: pan across, a mix, or still

- How each image moves in the video is now a per-project setting, Motion, next to Zoom (%) on Play → Outputs → Export and Edit project → Inputs. Zoom in and out is what videos did before and stays the default. Pan across slides a slightly zoomed crop over the image, taking turns left to right, right to left, top to bottom and bottom to top. Mix of both takes turns between a zoom and a pan. Still shows each image without moving.
- A pan uses the Zoom (%) as its crop, or 10% when the zoom is lower, so at 0% the pans still move while zooms keep the images still.
- The same project always moves its images the same way, so a re-render looks identical.
- Projects, revisions, drafts, templates and backups saved before this read as Zoom in and out, and their finished videos are kept as they are. Changing the motion re-renders only the video.
- The video render now works from an edit list: a versioned description of every shot, how it moves and the audio under it, recorded in `render.json` as `editList`. It replaces the `images` slots and the top-level `audio`, `width`, `height` and `fps` of a video's `render.json`; WAV exports keep their record as it was.
