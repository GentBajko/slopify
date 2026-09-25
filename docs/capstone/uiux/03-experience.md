---
absorbed_from:
  - features/2026-09-24-narration-preparation@2026-09-24
  - features/2026-09-10-subtitles-fonts@2026-09-10
  - features/2026-09-10-editable-projects@2026-09-12
  - features/2026-09-10-play-redesign-drafts@2026-09-13
  - features/2026-09-10-review-checkpoints@2026-09-13
generated_date: '2026-09-25'
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

## Layout rules

1. **Nothing moves unless you moved it.** System-triggered content (acknowledgements, refusals, server notices, save states) goes into a reserved StatusSlot or a toast, never a paragraph inserted above the work. Controls that do not apply right now are disabled, not unmounted. Meters and slots keep their track when empty. Skeletons match the final layout.
2. **The primary action is always on screen.** Editing surfaces end in a sticky ActionBar (or a drawer's pinned footer) that carries the primary action and its status line.
3. **The frame is fixed and small.** One 48 px header row, one centred 1200 px column, one footer; no sidebars, no floating controls.
4. **Summary before detail; one job per viewport.** The page bar and a summary (rundown strip, readiness rail, row list) come first. Secondary surfaces are tabs or drawers, never blocks inserted above the primary one.
5. **Help hides until asked.** At most one short line of visible help; anything longer sits behind an InfoTip.
6. **New features land in an existing place.** A tab, a drawer, a rail row, a strip cell or a slot from the kit (`packages/web/src/components/kit/`), not a new region.

## Navigation and orientation

- One sticky 48 px header on every app screen: mark and wordmark at left, then four destinations Projects, Play, Library, Settings. The active item carries a 2 px underline in the running-lamp colour. Library stays lit for `/prompts`, `/entries`, `/templates`, `/schedules` and their editors; Settings stays lit for `/settings` and `/usage` (`packages/web/src/components/shell.tsx`).
- Right end of the header: a tally lamp with "N running" whenever any project is running (links to Projects), the three support links (GitHub, Patreon, Buy Me a Coffee; labels from 1100 px, icons below, hidden below 640 px), the update button and the Tutorial "?" button.
- Library is one page bar with four route tabs (Prompts, Intros & Outros, Templates, Schedules); each tab keeps its URL and opens with a LibraryToolbar row of filters and its one action (`packages/web/src/routes/library.tsx`). Settings shows one section at a time from a left section list addressed by `?section=` (`packages/web/src/routes/settings.tsx`).
- Every route starts with a PageBar. Back links ("< Projects", "< Prompts", "< Intros & Outros") sit at the left of a detail page's bar, before its title.
- The marketing page has no app navigation; its header carries the wordmark, a GitHub link, and the donation links.

## Feedback thresholds

- Optimistic and immediate: switching a source, ticking a prompt, toggling theme, changing a select.
- Waits with inline confirmation: Save in Settings rows and in the prompt and entry editors shows a "Saved" tick for 2 s in a fixed-width slot, so the row never reflows.
- Acknowledgements ("Template saved.", "Schedule updated.", "Catalogue updated.", backup import counts) are toasts (`packages/web/src/components/kit/toast.tsx`). Errors the reader must act on stay in the StatusSlot beside the action, or inside the block where the press happened.
- Play navigates only after confirmed explicit Start. Review and autosave never admit work; uncertain Start recovers the same durable receipt.
- Anything longer than about one second shows a skeleton in the final layout's shape; no spinners in content.
- Stage progress is the lamp, the state word, and the meter: the rundown strip shows every stage and the Run percent; the active stage's header draws an always-present 2 px meter; article text streams into its sheet, images appear in their grid with a count, audio shows chunk k of M, research shows k of N chapters, video shows a render percentage (`logic/01`).

## Destructive actions

Posture: stop and confirm. A dialog precedes each of these, names the consequence in one sentence, and offers the action verb and Cancel: delete project ("Deletes the project and every file it produced."), delete prompt or entry ("Projects that used it keep their text."), cancel run ("Stops every running stage; finished outputs are kept."), re-run section, delete template, cancel or delete schedule, discard article edit, remove key ("Projects that used this provider cannot retry until a key is saved."), remove voice. Destructive actions sit in overflow menus (row menus, the project page's More menu, Retry stage's menu), never as the first button. Undo is not offered; the dialog is the safety net. Dialogs are the only modal surface in the app besides the first-run notice; drawers are non-modal.

## Error recovery

- Play keeps unsaved values visible after a failed write and exposes Retry beside the save state. Saved on this computer means server acknowledgement; only acknowledged content survives a process/browser loss. Conflicts offer explicit Reload saved draft or Save as a new draft.
- Failed work shows one failure line in its stage block: message, attempt count, an Error details popover, the unready provider with an Open Settings link, the recovery explanation behind an InfoTip, and Retry stage (a SplitButton whose menu holds Re-run section). Retry/Resume opens a fresh dependency/cost review; completed matching work is retained. Unknown submitted outcomes warn that retry may incur another charge. Save alone does not start work (`project/stage-row.tsx`, `project/use-actions.ts`, `project/rebuild-review.tsx`, `logic/12`).
- Project-level refusals appear in the reserved status line under the project page bar with Dismiss; stage refusals appear inside that stage's block.
- Local errors (disk, creation) show inline where the action was taken, with the OS message.
- Subtitle alignment/render/save failure leaves the last finished export and caption downloads visible; saved output metadata decides whether the player adds native VTT captions. Font-preview failure labels the fallback. Revision edits require Save or Discard before rebuilding. Cue text/timing uses complete current narration even when export has not finished; retained cues from earlier narration remain visible for explicit correction once the new timeline is available (`packages/web/src/project/revision-content.tsx`, `project/revision-caption-duration.ts`, `project/body-video.tsx`, `subtitles/font-picker.tsx`).
- A "Key missing" stage shows the disabled control with that label and a link to Settings (`logic/02`).

## Progressive disclosure

- Play groups configuration into three editor tabs (Content, Outputs, Style); Review opens as a drawer over the last editor. The readiness rail summarizes each part; pressing a row reveals the blocking field. Active source controls disclose their inputs.
- Audio keeps TTS, model and voice visible; one "Audio Advanced · …" disclosure, whose summary lists non-default choices, holds chunking, intro/outro, Narration Preparation, Pronunciation Glossary, the Choose Text Generation link and Settings. Text generation, Narration Preparation and Pronunciation Glossary help sit behind InfoTips.
- Review checkpoints (Before Audio, Images, Video / export) live in the Review drawer; the project page's Checkpoints tab shows dependents, revision identity, approval and cross-tab reload state.
- Project page: the rundown strip is the summary; Output, Edit, History and Checkpoints are tabs; the batch queue is a Queue · N popover; rebuild review opens in a drawer. Edit uses a section sub-nav whose hidden sections stay mounted.
- Templates and Schedules are Library tabs. Save a setup, New schedule and Edit schedule open drawers; a schedule's policy sits behind an InfoTip, its history stays collapsed until opened, and Pause/Resume, Cancel and Delete sit in its More menu (`packages/web/src/routes/templates.tsx`, `packages/web/src/routes/schedules.tsx`). Project page bars offer Save as template for the displayed current revision without rebuilding.
- Research and thumbnail default to Off and read as one line until switched on.
- Subtitles default Off; selecting files or burn-in reveals font, size, upload and a reduced-scale preview. Audio Off disables caption configuration, Video Off permits files only. An unfinished font upload remains recoverable outside inactive controls through Keep current font. The active controls explain local English timing and the first-use model download (`packages/web/src/subtitles/controls.tsx`).
- On the project page, the instructions sent to the LLM sit behind a "Show instructions" toggle per stage; sources and glossary files are links beside the article, not inline. Image groups show 12 images and a "Show all N images" control.
- Settings: CLI paths sit behind Change path; CLI sign-in and Inworld key help sit behind InfoTips.
- Dialogs carry no secondary options.

Narration Preparation follows optional Audio disclosure: Off by default, a named saved prompt when enabled, a link to shared text generation for supplied articles, and focused correction for missing prompts/slots or unsupported TTS models. Current and historical downloads distinguish unchanged narration text from tagged TTS script (`packages/web/src/play/narration-preparation.tsx`, `packages/web/src/project/narration-downloads.tsx`).

## Input burden

- Play autosaves incomplete editor documents in SQLite after 500 ms idle. The browser stores only the active draft ID; the Drafts popover restores acknowledged fields and completed owned uploads across restarts (`logic/22`).
- Nothing is asked twice: a slot shared by several prompts is one field; provider and model are asked only where a stage generates.
- Defaults are fixed by `logic/04`; the interface never invents others.

## Keyboard, pointer, touch

- Tab rows move with the arrow keys; route tabs are links. Play tab order follows the Run setup row, the compact readiness row on narrow screens, then the active editor, then the action bar.
- Ctrl/Cmd+Enter on Play opens the Review drawer; it never starts a run. Esc closes dialogs and drawers (a dialog opened from a drawer owns its own Esc); a drawer returns focus to what opened it. Enter confirms a dialog action only when its button has focus.
- Help opens on press (InfoTip), never on hover, so touch and keyboard reach it; no hover-only information.
- Below 1100 px Play controls stay at least 44 px tall; the desktop has no page-wide minimum beyond each control's own size. Play collapses to one column below 1100 px; no touch-specific gestures.

## Accessibility floor

- WCAG AA: 4.5:1 body and 3:1 large text and indicators on both themes, as `02-system.md` locks.
- Focus rings visible on every interactive element, 2 px in the focus colour with a 2 px offset.
- Lamps are never colour-only: the state word is rendered beside every lamp, and rundown strip cells announce state changes through their state words ("Audio: running", "Images: failed").
- StatusSlots are `role="status"`, or `alert` for errors; toasts follow the same split.
- `prefers-reduced-motion` honoured per `02-system.md`; the marketing recording pauses and restores native controls, while its default display loops without controls (`packages/site/public/main.js`, `index.html`).
- Files-mode MP4 preview offers a native English caption track; burned output already contains captions and receives no duplicate track. SRT/VTT download links remain available for either mode (`packages/web/src/project/body-video.tsx`).
- Every icon-only control has a label; every input has a visible label above it, or a short visible label with a full accessible name where rows repeat (schedule fixed keyword values).
- Interface copy: the product's own words, one register per page, zero em-dashes, controls name their action.

## Copy register

Deadpan and literal, owning "slop" without winking twice: "New run", "Play", "Retry stage", "Cancel run", "Nothing to narrate", "AI Slop, on demand." State words are uppercase engraved labels: PENDING, RUNNING, DONE, FAILED, CANCELED, PROVIDED, SKIPPED.

## Optional getting-started guide

`packages/web/src/tutorial/model.ts` defines 20 steps over the real Settings, prompt editors, Play and project pages. Settings steps open the providers or voices section first. Step 17 spotlights the optional subtitle controls, including upload and preview; Audio Off still lets the guide continue after explaining why captions are unavailable. Step 18 spotlights Start run in the Review drawer. Step 19 spotlights the project page bar, status line and rundown strip, and its copy names the Edit and History tabs and Retry stage's menu. A versioned server tutorial session stores stable step IDs, readiness and saved resource IDs; resources are revalidated on restore. It stores no keys, font bytes or form text. Play reveals the required tab, drawer and disclosure before spotlight measurement; drawers are non-modal so the spotlight can point into them. The guide neither generates subtitles nor starts a project (`tutorial/runner.tsx`, `step-content.tsx`).

## Not in play

Authentication, multi-user permissions and remote collaboration are absent from the local single-user shell (`packages/web/src/router.tsx`).

## Editing an existing project

- The Edit tab lists saved output status with Rebuild affected outputs and Edit project in its action bar. Edit project mounts a local draft in a form with a section sub-nav (Inputs, Article, Providers, Prompts, Subtitles, Images, Narration when audio generates, Captions); Save changes commits a retained revision without provider calls. The tab reads "Edit · unsaved" while a draft exists. Rebuild affected outputs opens a drawer presenting changed inputs, request identities in human-readable form, retained outputs and costs before Start rebuild.
- A remote revision change preserves the draft and says so in the action bar's status slot. Reload/discard is explicit. Identical failed request retries retain their idempotency key.
- Replacing/removing/reordering an image changes the draft; Save marks affected output stale and keeps its last finished media. Explicit rebuild produces the replacement.
- The History tab opens immutable retained outputs and text parts, including partial research. Restore creates a new current revision using those retained assets, without automatic generation; restore feedback shows in that tab. Externally missing files are labeled unavailable.
- Pending uploads hold Save/Discard. Cancellation waits for cleanup of the exact upload and cannot overwrite later draft state.

Sources: `packages/web/src/project/revision-workspace.tsx`, `revision-form.tsx`, `revision-history.tsx`, `revision-upload.tsx`, `rebuild-review.tsx`, `image-editor.tsx`.
