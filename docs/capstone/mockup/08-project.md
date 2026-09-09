---
absorbed_from:
 - features/2026-09-09-pausable-optional-runs@2026-09-10
 - features/2026-09-10-subtitles-fonts@2026-09-10
screen: project page
journeys: [J3-make-a-video, J4-bring-your-own, J5-revise, J6-revisit]
assumed:
 - a provided stage is labelled "provided"; Off stages are skipped, except Video Off with active Audio becomes an Audio export stage
 - header shows title, project status, format, created time, the prompts used
 - "Download all" for images is one archive
 - the article editor is inline with Save & continue
generated_date: 2026-09-09
capstone_version: 5.2.0
---

# 08 Project page

The whole pipeline of one project, stage by stage, with its outputs and actions.

## Layout

```
+--------------------------------------------------------------------+
| SLOPIFY [Projects] Play Prompts Settings |
+--------------------------------------------------------------------+
| < Projects |
| The Complete History of Vecna running · 16:9 · 08:12 |
| Documentary dossier · Oil painting scenes ×8, Map close-ups ×4 |
| [ Pause ] [ Cancel ] |
| |
| 1 RESEARCH done |
| Notes: "Vecna first appeared in Eldritch Wizardry (1976)..." |
| [Download.txt] |
| |
| 2 ARTICLE done |
| +----------------------------------------------------------+ |
| | **Origins & Inspirations**... | |
| +----------------------------------------------------------+ |
| [Edit] [Download.txt] [Sources] [Glossary] |
| (editing) [ Save & re-run from audio ] [Discard] |
| |
| 3 AUDIO running |
| Intro [▶ ──── 0:07] Body [▶ ────────── 00:00/--:--] Outro [▶ ── 0:05] |
| [Download.mp3] Re-run with voice [Narrator F v] [Re-run] |
| |
| 4 IMAGES pending |
| Oil painting scenes (8) |
| [img] [img] [img] [img] [img] [img] [img] [img] |
| Map close-ups (4) |
| [img] [img] [img] [img] |
| Thumbnail |
| [img] |
| per image: [Download] [Regenerate] [Download all] [Re-run] |
| |
| 5 VIDEO pending |
| [▶ ────────────────────────────────────── 16:9] |
| [Download.mp4] [Re-render] [Download.srt] [Download.vtt] |
| Subtitles [mode v] Font [font v] Size [48] [Upload font] |
| [Style preview] [Save subtitles] [Discard subtitle changes] |
+--------------------------------------------------------------------+
| Free · your keys, your machine [Patreon] [☕] |
+--------------------------------------------------------------------+
```

Element tree:
- App shell
 - Header: back, title, project status, format, created, prompts used (assumed), Pause/Resume and Cancel
 - Stage 1 Research: notes text, download
 - Stage 2 Article: text, edit, download, the sources and glossary files split from the end matter
 - Stage 3 Audio: players for intro, body, outro when present, download each, re-run with another voice
 - Stage 4 Images: grid per image prompt, thumbnail apart; per-image download and regenerate; download all; re-run stage
 - Final stage: MP4 video player or WAV audio player, download and re-render/export; skipped for article-only runs; subtitle mode/font controls remain visible with Audio Off guidance

## Elements

| Label | Does | Leads to |
|---|---|---|
| Pause / Resume | Pause drains active work and retains completed outputs; Resume continues unfinished stages | Stays |
| Providers | Available on paused/failed projects; save provider/model/voice choices without resuming; Resume waits until edits are saved or explicitly discarded | Stays |
| Cancel | Stops the running project | Stays; stage statuses update |
| Download.txt (research) | Saves the research notes | File |
| Edit (article) | Opens the text inline for editing | Stays |
| Save & re-run from audio | Replaces the article and re-runs dependent audio, LLM-written thumbnail and final export | Stays |
| Discard | Drops edits | Stays |
| Download.txt (article) | Saves the article | File |
| Sources, Glossary | Saves the end-matter files split out for narration | File |
| Audio players | Play the body narration and, when picked, the intro and outro segments | None |
| Download.mp3 | Saves the audio; container format `for: stack` | File |
| Re-run with voice | Regenerates audio with the picked voice | Stays |
| Image grid, per image: Download, Regenerate | Saves one image; regenerates that one image | File / stays |
| Download all | Saves every image and the thumbnail, one archive (assumed) | File |
| Re-run (images) | Regenerates the whole image stage | Stays |
| Video player | Plays the slideshow with alternating 100%–122.5% zoom; a native English VTT track appears only for files-mode output | None |
| Download.mp4 / Download.wav | Saves the selected final export | File |
| Download.srt / Download.vtt | Saves the timed subtitle files beside the final export, when produced | File |
| Save subtitles | Saves mode/font/size and rebuilds only the final export from existing narration/images; on a paused project waits for Resume | Stays |
| Discard subtitle changes | Restores saved subtitle settings; Resume waits for unsaved subtitle changes to be saved or discarded | Stays |
| Re-render | Rebuilds the video from the current article, audio, images | Stays |

## States

Per stage, one of: pending / running / done / failed, plus provided and skipped.

- Pending: placeholder, actions disabled.
- Running: progress shown; what progress a stage can report `rule: logic (S9-pipeline-lifecycle)`.
- Done: output rendered as drawn.
- Failed: the stage's error; retry, resume, or restart, and what downstream stages show `rule: logic (S9-pipeline-lifecycle)`.
- Provided: the user's own output shown in place; no re-run of that stage.
- Skipped: disabled stage; stage collapsed.
- Paused project: a distinct Paused status, Resume action and editable provider panel; each stage retains its own state and completed work.
- Failed project: provider choices can be saved, then Resume retries unfinished stages.
- Subtitle edits: active work locks controls; upload/save failures remain inline. Preview loads the selected font file, reports fallback if unavailable, and labels its reduced scale. SRT/VTT retain portable timing/text rather than embedded styling (`packages/web/src/subtitles/font-picker.tsx`, `project/subtitles.tsx`).
- Rebuilding subtitles: previous media and subtitle links remain playable until success; the player follows actual `output.meta.subtitlesMode`, not unsaved/current requested settings, so an old burned export never gains a duplicate native track (`project/body-video.tsx`).
- Audio export: Video Off with active Audio shows the WAV player and download. With both Off, the tutorial ends at Article download.
- Research through the LLM: the shape of the notes, and behavior when the model cannot research `rule: logic (S4-research)`.
- Article generated: how the rendered prompt and any research notes are sent, the output form, and what happens when the length control is missed `rule: logic (S5-article-writing)`.
- Article narrated: which sections the audio narrates, whether "Sources Consulted" and the pronunciation glossary are stripped or used as hints `rule: logic (S6-narration)`.
- Images from a prompt: how Number sends are made and how the thumbnail is derived `rule: logic (S7-image-generation)`.
- Image aspect vs format: whether 9:16 / 16:9 drives the image request, and how a mismatched image is fitted `rule: logic (S7-image-generation)`.
- Video timing: image durations against audio length, zoom pattern and unchanged per-image slots `rule: logic (S8-video-assembly)`.
- After an edit or re-run: which downstream outputs are invalidated, kept, or cascaded; regenerate-one-image against the existing video `rule: logic (S10-reruns)`.
- Canceling: which in-flight calls stop, which outputs survive, project status afterwards `rule: logic (S11-cancel)`.
- Telemetry after a stage: which counters this project contributes and when they are sent `rule: logic (S12-telemetry)`.
- Storage: where outputs live on this machine and how downloads are named `rule: logic (S14-storage-and-downloads)`.
- Prompt deleted since the run: what the header's prompts line shows `rule: logic (S15-prompt-management)`.
