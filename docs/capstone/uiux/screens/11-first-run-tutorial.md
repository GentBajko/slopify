---
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: e1128b2acab3
paths_covered:
  - ":(top)packages/web/src/tutorial/**"
  - ":(top)packages/web/src/components/notice.tsx"
  - ":(top)packages/app/src/slices/settings/tutorial*"
---

# First-run notice and tutorial

## Mode & job

Two app-wide overlays mounted by the Shell. `FirstRunNotice` is the one-time anonymous-usage-stats disclosure whose single button is also the consent (`packages/web/src/components/notice.tsx:38-41`, `packages/web/src/components/shell.tsx:516`). The tutorial is a spotlight guide over the real controls: 25 steps with stable string IDs, from provider keys through prompts, Play and the project page to Home, Channels and the Calendar (`packages/web/src/tutorial/model.ts:19-112`). `TutorialProvider` wraps every route (`packages/web/src/components/shell.tsx:170-176`). The `/welcome` first-run screen, which Home opens once when first-run state says to show it (`packages/web/src/routes/home.tsx:61-63`), is a separate surface: see `16-welcome.md`.

## Composition

**First-run notice.** A kit `Dialog` with `dismissible={false}`, title "Anonymous usage stats", description "These numbers power the live counters on slopify.stream." (`notice.tsx:58-62`). Body: a two-column grid, "Tracked" (11 items: tokens per stage with provider and model, audio seconds, images, thumbnails, videos, PDF documents, YouTube descriptions, shorts, projects, the install, and the time of each) and "Never tracked" (API keys, prompt bodies, keyword values, titles, article or research text, files and filenames, OS/locale/hardware), each headed by an engraved label over a rule (`notice.tsx:14-36`, `notice.tsx:77-80`, `notice.tsx:99-119`). Then a small ink-2 paragraph on random IDs, an engraved `Slopify <version> · this version is included in each report` line when the version is known, and the one footer button, primary "Got it", with `autoFocus` (`notice.tsx:63-89`).

**Entry points to the tutorial.**

| Entry | Where | Control | Source |
|---|---|---|---|
| Launcher | Sidebar foot at ≥768px, beside `UpdateWidget` and the Tutorials book link; phone top bar below that | Kit `IconButton` with `CircleHelpIcon`, label "Start interactive tutorial"; disabled while running with reason "The tutorial is already running" | `tutorial/launcher.tsx:5-19`, `components/shell.tsx:304`, `components/shell.tsx:436-441`, `components/shell.tsx:487-489` |
| Invite | Projects list when it has zero projects | Bordered surface panel: "Make your first video", one-line explanation, secondary "Start tutorial"; hidden while the tutorial runs | `tutorial/launcher.tsx:21-38`, `routes/projects.tsx:194` |

**Spotlight.** Portaled to `document.body` (`tutorial/spotlight.tsx:96-210`). A fixed full-viewport SVG at `z-[100]` paints `rgb(0 0 0 / 0.72)` with mask holes over the target and any related picker portals, rounded 6px, plus a 2px `--color-accent` outline on the target hole (`spotlight.tsx:99-142`). Holes pad the target box by 6px (`tutorial/spotlight-geometry.ts:57-63`). The card is a `section` at `z-[101]`, `rounded-media`, `border-line-strong`, `bg-surface`, `shadow-pop`, max 360px wide and between 160 and 420px tall (48% of viewport) (`spotlight.tsx:143-158`). Card, top to bottom:

1. Engraved accent-ink kicker "Getting started · N of 25 · First project" and a quiet "Exit" button (`spotlight.tsx:159-164`, `tutorial/runner.tsx:196`).
2. `h2` step title, `text-title-3` bold, focus target (`spotlight.tsx:165-172`).
3. Scrollable instructions from `StepContent`, plus a status line when the target is missing and a docking hint (`spotlight.tsx:173-189`).
4. Footer row over a rule: Back, a quiet skip button, primary Next pushed right (`spotlight.tsx:190-205`).

Placement: right of the target, else left, else below, else above; a target too large for all four docks the card bottom-right, clips the hole above the card and adds a bottom spacer plus `scroll-padding-bottom` so the target can scroll clear (`spotlight-geometry.ts:20-55`, `spotlight.tsx:74-94`).

**Steps and their pages** (`tutorial/model.ts:19-112`):

| # | IDs | Page opened on entry | Target `data-tour` |
|---|---|---|---|
| 1-4 | text-key, audio-key, image-key, voice | `/settings?section=providers` (voice: `section=voices`) | `keys-llm`, `keys-tts`, `keys-image` (`components/provider-keys.tsx:112`), `voices` (`components/voices.tsx:64`) |
| 5-8 | article-name, article-body, article-keywords, article-save | `/prompts/new?kind=article`, or the saved article prompt | `prompt-name`, `prompt-body`, `prompt-slots`, `prompt-save` (`routes/prompt-editor.tsx:179-315`) |
| 9-10 | image-prompt, image-save | `/prompts/new?kind=image`, or the saved image prompt | `prompt-editor`, `prompt-save` |
| 11-18 | play-options … play-start | `/play`, then Play's Content, Outputs or Style section via `play.navigate` | `play-options` (`routes/play.tsx:558`), `play-<kind>` (`play/rail-frame.tsx:60`), `play-keywords` (`components/keyword-list.tsx:84`), `play-subtitles` (`play/style-section.tsx:22`), `play-start` (`play/start-rail.tsx:134`) |
| 19-22 | project, download, run-cost, studio-prep | `/projects/$projectId` | `project-controls` (`routes/project.tsx:517`), `project-video`/`project-article` (`project/stage-section.tsx:107`), `project-rail-cost`, `project-rail-video` (`routes/project.tsx:774`) |
| 23-25 | home, channels, calendar | `/`, `/channels`, `/calendar` | `home` (`routes/home.tsx:118`), `channels` (`routes/channels.tsx:84`), `calendar` (`routes/calendar.tsx:254`) |

Navigation happens once on step entry (`runner.tsx:45-93`); Play steps wait until the section is revealed before rendering (`runner.tsx:95-105`, `runner.tsx:125-126`, `model.ts:142-152`). Target substitutions: `download` on an article-only project targets `project-article`; `play-keywords` with no keyword fields targets `play-options`; `studio-prep` without a video output targets `project-controls` (`runner.tsx:177-186`).

## States

| State | Trigger | Treatment | Source |
|---|---|---|---|
| Notice loading | Notice query pending | Nothing rendered | `notice.tsx:52-54` |
| Notice shown | `seen === false` | Dialog open; no close icon, Esc does not dismiss | `notice.tsx:38-41`, `notice.tsx:54-60` |
| Notice saving | Dismiss mutation pending | "Got it" disabled | `notice.tsx:68` |
| Notice error | Dismiss fails | `role="alert"` danger text with the error message | `notice.tsx:90-94` |
| Tutorial gated | Notice not yet seen | Runner renders nothing and does not navigate | `runner.tsx:43-46`, `runner.tsx:124` |
| Next disabled | Readiness not met: a ready provider of the family (1-3), a voice on a ready provider (4), prompt named/body/keywords/kind flags (5-9), Play section ready flags (11-17) | Primary disabled | `runner.tsx:127-158`, `runner.tsx:200` |
| Waiting for save | Steps 8 and 10 | Next reads "Use Save in the editor" and is disabled; the step advances only after the editor's successful save returns to `/prompts`; step 9 with an image ID jumps to step 11 | `runner.tsx:107-122`, `runner.tsx:187`, `runner.tsx:201-203` |
| Saving | Prompt save in flight | Next disabled, Back and skip hidden | `runner.tsx:188-189`, `runner.tsx:198-210` |
| Play start | Step 18 | Next "Use Start run / Queue N on the page", disabled; skip "Skip generating" jumps to step 23 | `runner.tsx:157`, `runner.tsx:162-166`, `runner.tsx:204-213` |
| Project created | `project-created` event | Session records the project ID and moves to step 19 | `model.ts:120-131` |
| No Back | Step 1, step 19, or while saving; Back from step 23 without a project returns to step 18 | Back hidden or redirected | `runner.tsx:168-176`, `runner.tsx:198` |
| Target missing | Selector matches nothing or has zero size | Next disabled; `role="status"` waiting-tone line | `spotlight.tsx:178-183`, `spotlight.tsx:200`, `tutorial/spotlight-dom.ts:34-39` |
| Docked | Target fills the viewport | Hint "Scroll the page to work through the highlighted section." | `spotlight.tsx:184-188` |
| App dialog open | A kit dialog opens from the target | Overlay hidden; input blocking and focus trapping pause | `tutorial/use-spotlight-measurement.ts:88`, `spotlight.tsx:101`, `tutorial/use-spotlight-interaction.ts:39-58` |
| Provider/voice query error | Either query fails | Danger paragraph with the message inside the card | `runner.tsx:220-222` |
| Save failure | PUT fails | Fixed bottom-left `role="alert"` panel with the message, "Retry tutorial save" and "Restart tutorial"; fallback message "Your tutorial progress wasn't saved. You can keep going; it will try again on the next step." | `tutorial/context.tsx:69-82`, `tutorial/use-session.ts:31-36` |
| Unreadable progress | Server view `readable: false` or unparsable | Same panel, "Saved tutorial progress cannot be read. Choose Restart tutorial to recover." | `use-session.ts:85-104`, `tutorial/session-api.ts:17-26` |
| Unknown step | Step index outside the list | "This tutorial step isn't recognised. Choose Restart tutorial to start over." | `use-session.ts:45-49` |

Persistence: the server stores `{schemaVersion: 1, active, stepId, articleId?, imageId?, projectId?}` with a version counter; writes carry `baseVersion` and a `mutationId`, and a stale base is a conflict (`packages/app/src/slices/settings/tutorial-schema.ts:3-52`, `packages/app/src/slices/settings/tutorial.ts:57-76`). The client queues writes and sends them serially (`use-session.ts:37-79`). On restore it maps `stepId` to the current index, drops article/image IDs whose prompt no longer exists with that kind, and reads the project (`use-session.ts:91-133`). Updates and a Start made before restore finishes are deferred and replayed (`use-session.ts:68-72`, `use-session.ts:80-84`, `use-session.ts:131-132`). Restart deletes the stored session and starts at step 1 (`use-session.ts:140-163`).

Interaction boundary: pointer, click and keyboard events outside the target, the card and the target's own picker portals are cancelled in the capture phase; Tab cycles only through those roots; focus that escapes returns to the step title; Escape closes an open picker first, then exits the guide (`use-spotlight-interaction.ts:27-111`). On unmount focus returns to the element focused before the step (`use-spotlight-interaction.ts:13-25`).

## Motion

No authored animation in the tutorial or the notice beyond the kit Dialog's own entrance. The spotlight re-measures on a `requestAnimationFrame` after DOM mutations (id, class, style, hidden, aria-controls, data-state, data-tour), resizes, scrolls and visual-viewport changes (`use-spotlight-measurement.ts:94-127`). A newly found target is scrolled to `block: "start"` with `behavior: "instant"` one frame after the card commits (`use-spotlight-measurement.ts:58-69`). Related picker portals are lifted to `z-index: 102` while open and restored after (`use-spotlight-measurement.ts:70-80`, `use-spotlight-measurement.ts:138`). The step title takes focus on each step unless an app dialog is open (`use-spotlight-measurement.ts:128`).

## Copy

- Kicker: "Getting started · N of 25 · First project"; card `aria-label` "Interactive getting started guide" (`runner.tsx:196`, `spotlight.tsx:145`).
- Buttons: "Next", "Back", "Exit", "Finish tutorial" on step 25, skip labels "Skip this step" / "Skip without saving" / "Skip generating" (`runner.tsx:201-217`, `spotlight.tsx:161-203`).
- Step titles are numbered sentences, e.g. "1. Connect a text provider", "18. Review and start your run", "22. Prepare the YouTube upload", "25. Plan uploads on the calendar" (`model.ts:20-111`).
- Key steps name the real Settings controls (API key, Test, Save), link each key-provider's key page from `keyGuides`, and state "The tutorial never reads your key." (`tutorial/setup-content.tsx:5-16`, `setup-content.tsx:44-70`).
- Prompt steps carry copyable examples using `{{topic}}` and `{{audience}}` with a "Copy example" / "Copied" button and a manual-copy fallback line (`tutorial/step-content.tsx:5-8`, `tutorial/content-parts.tsx:24-50`).
- Step 18 warns that Start "creates a project and sends generation requests to your chosen providers, which may charge your account" (`step-content.tsx:242-258`).
- Step 22: "Slopify never uploads for you." (`step-content.tsx:325-338`).
- Step 25 closes: "You have reached the end." and points at the question-mark button at the foot of the sidebar and the book beside it for Help → Tutorials (`step-content.tsx:354-369`).
- Notice: "Every event carries a random ID of its own and this machine's random ID, and nothing else. Nothing you write, upload, or paste ever leaves your machine." (`notice.tsx:81-84`).

## Not in play

The tutorial never presses Save, Start or any generating control; steps 8, 10 and 18 disable Next and wait for the user's own action (`runner.tsx:144-157`). It stores no key, prompt text, keyword value or form state, only the step ID and three resource IDs (`tutorial-schema.ts:3-38`); measurement reads layout only (`use-spotlight-measurement.ts:32-33`). The notice has no decline path and no settings link. The tutorial does not cover `/welcome`, starter packs, the What's new tour or patch notes. No per-step analytics.
