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

A focused workspace for one project, with overall progress and a persistent stage navigator.

## Layout

```text
+--------------------------------------------------------------------+
| App navigation                                                     |
+--------------------------------------------------------------------+
| < Projects                                                         |
| DONE / RUNNING / PAUSED / FAILED                                    |
| Project title                 [Download video] [Run settings]       |
| Prompt · format · started                     [Pause] [Cancel]     |
|                                                                    |
| Overall progress · 3 of 6 stages finished                    58%    |
| [====================================------------------------]     |
|                                                                    |
| STAGES              | Selected stage workspace                     |
| Research      done  | Heading · status · individual progress       |
| Article       done  |                                              |
| Audio      running  | Output / editor / live preview                |
| Images     running  |                                              |
| Thumbnail  pending  | Contextual actions and downloads               |
| Video      pending  |                                              |
+--------------------------------------------------------------------+
| Free. Your keys, your machine.                       [Update icon]  |
+--------------------------------------------------------------------+
```

The navigator is a sticky left column on desktop and a compact grid above the workspace on narrow screens. Its buttons retain each stage's status and summary. The selected pane initially follows a failed stage, then an active stage, then the completed export. Selecting a stage takes control of navigation until the project changes. Stage panes remain mounted while hidden so unsaved article and provider edits survive navigation.

The header offers the completed MP4, WAV or article download directly. Run settings reveals provider/model/voice controls, with existing pause, resume and unsaved-change rules. The overall bar excludes skipped stages, counts done/provided stages as complete, and incorporates measurable partial stage progress. All included stages have equal weight; unknown work contributes zero and the bar cannot reach 100% until every included stage finishes. It is not a remaining-time estimate.

Research and article actions appear above bounded, keyboard-scrollable reading regions. The final player is centered with a bounded height; subtitle and font editing sits under the Subtitles & fonts disclosure. Failed stages put Retry stage and provider-change guidance before collapsed Error details, which preserves the complete provider error.

Live writing displays visible response text as it arrives, with a selector for concurrent research calls and a Follow output toggle. Reconnects receive a bounded snapshot of the current attempt; retries replace that attempt's preview. Reasoning and prompts are excluded. Live narration offers a separate native player for each body part, intro or outro while Audio runs. Pressing Play listens from that part's beginning, including retained bytes. Previews never create extra provider calls or autoplay; completed output players remain the durable playback/download path.

The app-wide floating update icon opens installed/latest versions, Check again and an explicit Update Slopify action. Checks run every 15 minutes and on window focus. Active work blocks installation; accepted updates restart the local server and reload the tab when the new version responds. The icon shows availability, installation and failure states.

## Elements

| Label | Does | Leads to |
|---|---|---|
| Pause / Resume | Pause drains active work and retains completed outputs; Resume continues unfinished stages | Stays |
| Run settings | Available on paused/failed projects; save provider/model/voice choices without resuming; Resume waits until edits are saved or explicitly discarded | Stays |
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

- Pending: dependency guidance in the selected workspace; actions disabled.
- Running: individual and overall progress shown; live writing/audio previews when bytes arrive; what progress a stage can report `rule: logic (S9-pipeline-lifecycle)`.
- Done: output is available in its selected workspace; a completed final export opens first.
- Failed: the stage's error; retry, resume, or restart, and what downstream stages show `rule: logic (S9-pipeline-lifecycle)`.
- Provided: the user's own output shown in place; no re-run of that stage.
- Skipped: labelled Off in navigation, with an explanatory empty state when selected.
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
