---
generated_date: 2026-09-02
capstone_version: 5.2.0
implements: [Q4, Q18, Q19]
source: uiux-interview.md
---

# 03 Experience

Rules every screen applies rather than re-decides. `build` reads this beside `02-system.md`; `review` judges the shipped UX against it.

## Navigation and orientation (§Q18)

- One top bar on every app screen: mark and wordmark at left, then Projects, Play, Prompts, Intros & Outros, Settings, Usage; the active item carries a 2 px underline in the running-lamp colour; the page title repeats the section name below the bar.
- Right end of the bar: a tally "N running" whenever any project is running; it links to Projects.
- The marketing page has no app navigation; its header carries the wordmark, a GitHub link, and the donation links.
- Back links ("< Projects", "< Prompts") sit above a detail page's title.

## Feedback thresholds (§Q18)

- Optimistic and immediate: switching a source, ticking a prompt, toggling theme, changing a select.
- Waits with inline confirmation: Save in Settings, Prompts, and Intros & Outros shows a "Saved" tick beside the button for 2 s.
- Play navigates to the project page at once; the first lamp lights when the first stage starts.
- Anything longer than about one second shows a skeleton in the final layout's shape; no spinners in content.
- Stage progress is the lamp, the state word, and the meter: article text streams into its rail, images appear in their grid one by one with a count, audio shows chunk k of M, research shows k of N chapters, video shows a render percentage (`logic/01` §Q6).

## Destructive actions (§Q4, §Q18)

Posture: stop and confirm. A dialog precedes each of these, names the consequence in one sentence, and offers the action verb and Cancel: delete project ("Deletes the project and every file it produced."), delete prompt or entry ("Projects that used it keep their text."), delete image ("Removed from the slideshow; the video re-renders."), cancel run ("Stops every running stage; finished outputs are kept."), discard article edit, remove key ("Projects that used this provider cannot retry until a key is saved."), remove voice. Undo is not offered; the dialog is the safety net. Dialogs are the only modal surface in the app besides the first-run notice.

## Error recovery (§Q18)

- The user's work is never lost by a failure: the Play form keeps its values, an article edit in progress stays in the editor, staged uploads stay staged.
- A failed stage shows the provider's error text verbatim and the attempt count under its rail, with "Retry stage" as the recovery (`logic/01` §Q3, §Q10). Nothing retries silently beyond the four automatic attempts.
- Local errors (disk, creation) show inline where the action was taken, with the OS message.
- A "Key missing" stage shows the disabled control with that label and a link to Settings (`logic/02` §Q13).

## Progressive disclosure (§Q18)

- A stage rail shows only the controls of its active source; Off and Provide collapse the rail to one line (the filename for Provide).
- Research and thumbnail default to Off and read as one line until switched on.
- On the project page, the instructions sent to the LLM sit behind a "Show instructions" toggle per stage; sources and glossary files are links beside the article, not inline.
- Dialogs carry no secondary options.

## Input burden (§Q18)

- The Play form remembers the last run's choices for the browser tab's life (`logic/04` §Q33, §Q36); nothing is remembered across restarts.
- Nothing is asked twice: a slot shared by several prompts is one field; provider and model are asked only where a stage generates.
- Defaults are fixed by `logic/04` §Q32; the interface never invents others.

## Keyboard, pointer, touch (§Q18)

- Desktop first. Tab order: top bar, stage rails top to bottom with their controls left to right, then the cue sheet, then Play.
- Ctrl/Cmd+Enter presses Play from anywhere on the form when it is valid; Esc closes any dialog; Enter confirms a dialog's primary action only when its button has focus.
- Pointer targets at least 32 px tall; no hover-only information.
- Touch: layouts collapse to a single column below 900 px with the cue sheet after the rails and Play sticky at the bottom; no touch-specific gestures.

## Accessibility floor (§Q18)

- WCAG AA: 4.5:1 body and 3:1 large text and indicators on both themes, as `02-system.md` locks.
- Focus rings visible on every interactive element, 2 px in the focus colour with a 2 px offset.
- Lamps are never colour-only: the state word is rendered beside every lamp, and rows carry an `aria-live` region announcing state changes ("Audio: running", "Images: failed").
- `prefers-reduced-motion` honoured per `02-system.md`.
- Every icon-only control has a label; every input has a visible label above it.
- Interface copy: the product's own words, one register per page, zero em-dashes, controls name their action.

## Copy register

Deadpan and literal, owning "slop" without winking twice: "New run", "Play", "Retry stage", "Cancel run", "Nothing to narrate", "Slop, on schedule." State words are uppercase engraved labels: PENDING, RUNNING, DONE, FAILED, CANCELED, PROVIDED, SKIPPED.
