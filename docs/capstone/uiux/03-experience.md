---
absorbed_from:
  - features/2026-09-24-narration-preparation@2026-09-24
  - features/2026-09-10-subtitles-fonts@2026-09-10
  - features/2026-09-10-editable-projects@2026-09-12
  - features/2026-09-10-play-redesign-drafts@2026-09-13
  - features/2026-09-10-review-checkpoints@2026-09-13
generated_date: '2026-09-13'
capstone_version: 5.2.0
generated_at_commit: 7bdb84e3f57e
paths_covered:
  - :(top)packages/web/src/**
  - :(top)packages/site/public/index.html
  - :(top)packages/site/public/main.js
content_hash: ce87f880f708
---

# 03 Experience

Rules every screen applies rather than re-decides. `build` reads this beside `02-system.md`; `review` judges the shipped UX against it.

## Navigation and orientation

- One top bar on every app screen: mark and wordmark at left, then Projects, Play, Templates, Schedules, Prompts, Intros & Outros, Settings and Usage. The active item carries a 2 px underline in the running-lamp colour (`packages/web/src/components/shell.tsx:22-31`, `packages/web/src/components/shell.tsx:108-123`).
- Right end of the bar: a tally "N running" whenever any project is running; it links to Projects.
- The marketing page has no app navigation; its header carries the wordmark, a GitHub link, and the donation links.
- Back links ("< Projects", "< Prompts") sit above a detail page's title.

## Feedback thresholds

- Optimistic and immediate: switching a source, ticking a prompt, toggling theme, changing a select.
- Waits with inline confirmation: Save in Settings, Prompts, and Intros & Outros shows a "Saved" tick beside the button for 2 s.
- Play navigates only after confirmed explicit Start. Review and autosave never admit work; uncertain Start recovers the same durable receipt.
- Anything longer than about one second shows a skeleton in the final layout's shape; no spinners in content.
- Stage progress is the lamp, the state word, and the meter: article text streams into its rail, images appear in their grid one by one with a count, audio shows chunk k of M, research shows k of N chapters, video shows a render percentage (`logic/01`).

## Destructive actions

Posture: stop and confirm. A dialog precedes each of these, names the consequence in one sentence, and offers the action verb and Cancel: delete project ("Deletes the project and every file it produced."), delete prompt or entry ("Projects that used it keep their text."), cancel run ("Stops every running stage; finished outputs are kept."), discard article edit, remove key ("Projects that used this provider cannot retry until a key is saved."), remove voice. Undo is not offered; the dialog is the safety net. Dialogs are the only modal surface in the app besides the first-run notice.

## Error recovery

- Play keeps unsaved values visible after a failed write and exposes Retry. Saved on this computer means server acknowledgement; only acknowledged content survives a process/browser loss. Conflicts offer explicit Reload or Save as a new draft.
- Failed work displays its error and current-revision attempt count. Retry/Resume opens a fresh dependency/cost review; completed matching work is retained. Unknown submitted outcomes warn that retry may incur another charge. Save alone does not start work (`project/use-actions.ts`, `project/rebuild-review.tsx`, `logic/12`).
- Local errors (disk, creation) show inline where the action was taken, with the OS message.
- Subtitle alignment/render/save failure leaves the last finished export and caption downloads visible; saved output metadata decides whether the player adds native VTT captions. Font-preview failure labels the fallback. Revision edits require Save or Discard before rebuilding. Cue text/timing uses complete current narration even when export has not finished; retained cues from earlier narration remain visible for explicit correction once the new timeline is available (`packages/web/src/project/revision-content.tsx`, `project/revision-caption-duration.ts`, `project/body-video.tsx`, `subtitles/font-picker.tsx`).
- A "Key missing" stage shows the disabled control with that label and a link to Settings (`logic/02`).

## Progressive disclosure

- Play groups configuration into Content, Outputs, Style and Review. Active source controls disclose their inputs; project stage rails remain a separate progress surface.
- Templates are a first-class navigation item. The Templates screen saves an acknowledged Play draft or applies a named immutable snapshot into a fresh draft; applying never starts work. Project headers offer Save as template for the displayed current revision and explain that it does not rebuild the project.
- Schedules are a first-class navigation item. The screen binds a saved template version to a local cadence, timezone, missed-run policy, spend ceiling and optional keyword variants; history stays collapsed until opened (`packages/web/src/routes/schedules.tsx:68-126`, `packages/web/src/routes/schedules.tsx:215-365`, `packages/web/src/routes/schedules.tsx:370-505`).
- Review checkpoints use the same explicit-save and refusal-focus language: Audio, Images and Video/export can be held from Play, while the project panel shows dependents, revision identity, approval and cross-tab reload state.
- Research and thumbnail default to Off and read as one line until switched on.
- Subtitles default Off; selecting files or burn-in reveals font, size, upload and a reduced-scale preview. Audio Off disables caption configuration, Video Off permits files only. An unfinished font upload remains recoverable outside inactive controls through Keep current font. The active controls explain local English timing and the first-use model download (`packages/web/src/subtitles/controls.tsx`).
- On the project page, the instructions sent to the LLM sit behind a "Show instructions" toggle per stage; sources and glossary files are links beside the article, not inline.
- Dialogs carry no secondary options.

Narration Preparation follows optional Audio disclosure: Off by default, a named saved prompt when enabled, a link to shared text generation for supplied articles, and focused correction for missing prompts/slots or unsupported TTS models. Current and historical downloads distinguish unchanged narration text from tagged TTS script (`packages/web/src/play/narration-preparation.tsx`, `packages/web/src/project/narration-downloads.tsx`).

## Input burden

- Play autosaves incomplete editor documents in SQLite after 500 ms idle. The browser stores only the active draft ID; Drafts restores acknowledged fields and completed owned uploads across restarts (`logic/22`).
- Nothing is asked twice: a slot shared by several prompts is one field; provider and model are asked only where a stage generates.
- Defaults are fixed by `logic/04`; the interface never invents others.

## Keyboard, pointer, touch

- Play tab order follows section navigation and visible content. On narrow screens the in-flow Preview disclosure precedes the editor; the additional setup summary follows the section action.
- Ctrl/Cmd+Enter opens Review; it never starts a run. Esc closes dialogs; Enter confirms a dialog action only when its button has focus.
- Play pointer targets are at least 40 px, increasing to 44 px on narrow screens; no hover-only information.
- Play collapses to one column below 1100 px, with an in-flow Preview disclosure and action controls; no touch-specific gestures.

## Accessibility floor

- WCAG AA: 4.5:1 body and 3:1 large text and indicators on both themes, as `02-system.md` locks.
- Focus rings visible on every interactive element, 2 px in the focus colour with a 2 px offset.
- Lamps are never colour-only: the state word is rendered beside every lamp, and rows carry an `aria-live` region announcing state changes ("Audio: running", "Images: failed").
- `prefers-reduced-motion` honoured per `02-system.md`; the marketing recording pauses and restores native controls, while its default display loops without controls (`packages/site/public/main.js`, `index.html`).
- Files-mode MP4 preview offers a native English caption track; burned output already contains captions and receives no duplicate track. SRT/VTT download links remain available for either mode (`packages/web/src/project/body-video.tsx`).
- Every icon-only control has a label; every input has a visible label above it.
- Interface copy: the product's own words, one register per page, zero em-dashes, controls name their action.

## Copy register

Deadpan and literal, owning "slop" without winking twice: "New run", "Play", "Retry stage", "Cancel run", "Nothing to narrate", "AI Slop, on demand." State words are uppercase engraved labels: PENDING, RUNNING, DONE, FAILED, CANCELED, PROVIDED, SKIPPED.

## Optional getting-started guide

`packages/web/src/tutorial/model.ts` defines 20 steps over the real Settings, prompt editors, Play and project pages. Step 17 spotlights the optional subtitle controls, including upload and preview; Audio Off still lets the guide continue after explaining why captions are unavailable. A versioned server tutorial session stores stable step IDs, readiness and saved resource IDs; resources are revalidated on restore. It stores no keys, font bytes or form text. Play reveals the required section and disclosure before spotlight measurement. The guide neither generates subtitles nor starts a project (`tutorial/runner.tsx`, `step-content.tsx`).

## Not in play

Authentication, multi-user permissions and remote collaboration are absent from the local single-user shell (`packages/web/src/router.tsx:43-151`).


## Editing an existing project

- Edit project mounts a local draft; Save commits a retained revision without provider calls. Rebuild affected outputs presents changed inputs, request identities in human-readable form, retained outputs and costs before Start rebuild.
- A remote revision change preserves the draft and displays a conflict notice. Reload/discard is explicit. Identical failed request retries retain their idempotency key.
- Replacing/removing/reordering an image changes the draft; Save marks affected output stale and keeps its last finished media. Explicit rebuild produces the replacement.
- History opens immutable retained outputs and text parts, including partial research. Restore creates a new current revision using those retained assets, without automatic generation. Externally missing files are labeled unavailable.
- Pending uploads hold Save/Discard. Cancellation waits for cleanup of the exact upload and cannot overwrite later draft state.

Sources: `packages/web/src/project/revision-workspace.tsx`, `revision-history.tsx`, `revision-upload.tsx`, `rebuild-review.tsx`, `image-editor.tsx`.
