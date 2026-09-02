---
generated_date: 2026-09-02
capstone_version: 5.2.0
source: mockup-interview.md (Q1-Q28)
---

# Slopify mockup

Screens as markdown wireframes, one file each, numbered in journey order. Every element and state traces to a `§Q` in `../mockup-interview.md`; `rule: logic (S<n>-...)` marks a state whose rule the `logic` stage settles, owned by exactly one row of the Scenarios table below.

## Screens

| Screen | Journeys served | §Q implemented |
|---|---|---|
| [01 Marketing page](01-marketing-page.md) | J1 | Q20, Q21, Q23, Q24, Q25, Q27 |
| [02 First-run notice](02-first-run-notice.md) | J1, J2 | Q25, Q26 |
| [03 Settings](03-settings.md) | J1, J2 | Q1, Q15, Q16, Q21, Q23, Q30 |
| [04 Prompts](04-prompts.md) | J2 | Q6, Q7, Q11, Q13 |
| [05 Prompt editor](05-prompt-editor.md) | J2 | Q6, Q7, Q11, Q12, Q13 |
| [06 Play](06-play.md) | J2, J3, J4 | Q1, Q7, Q9-Q16, Q18, Q21, Q28, Q30, Q31 |
| [07 Projects](07-projects.md) | J3, J6 | Q1, Q10, Q17, Q18, Q19 |
| [08 Project page](08-project.md) | J3, J4, J5, J6 | Q1, Q9, Q13, Q17, Q18, Q19, Q21, Q25, Q28, Q30, Q31 |
| 09 Intros & Outros library (not drawn here; `uiux/screens/09-intros-outros.md`) | J2 | Q30 |
| 10 Usage (not drawn here; `uiux/screens/10-usage.md`) | J6 | Q29 |

App shell on 02-08: nav Projects / Play / Prompts / Settings, footer with donation links (Q23). Nav order assumed.

## Journeys

| Journey | Path |
|---|---|
| J1 discover and install | 01 → terminal `npx slopify@latest` → 02 → 03 |
| J2 first-run setup | 02 → 03 (keys, voices, outro text) → 04 → 05 → 04 → 06 |
| J3 make a video | 07 → 06 → 08 (stages run) → download mp4 |
| J4 bring your own | 06 (Provide on any stage) → 08 |
| J5 revise | 08 → edit article / re-run audio / regenerate image / re-render → 08 → download |
| J6 revisit | 07 → 08 → downloads |

## Scenarios for `logic`

One row per behavior the product decides. Screens: where it surfaces. Open threads: what `logic` must settle, carried from the interview's `for: logic` ledger.

| # | Behavior | Screens | Open threads |
|---|---|---|---|
| S1 | Placeholder substitution | 05, 06 | `{{name}}` detection rules; malformed slots; merge of a name shared across article, image, and thumbnail prompts; empty value at play; a value containing `{{` |
| S2 | Run admission | 06 | Required fields and what blocks Play; a second play while a project runs; whether the form persists after submit |
| S3 | Provided outputs | 06, 08 | Per-stage validation of pasted text and uploaded audio/images (formats, sizes, counts, empty); recording prompts and slots when a stage is provided; a run with everything provided but video |
| S4 | Research stage | 06, 08 | What research through the LLM does and produces; behavior when the chosen model cannot research; toggle scope (per run, Q14) |
| S5 | Article writing | 08 | How the rendered prompt and research notes are sent; whether research feeds "Sources Consulted"; output form; length-control misses |
| S6 | Narration | 08 | Which article sections are narrated (end matter stripped or read); pronunciation glossary as TTS hints; long-text chunking |
| S7 | Image generation | 06, 08 | Number sends per prompt and how images vary; thumbnail derivation (runs once, assumed); aspect ratio following 16:9 / 9:16; fitting a mismatched image |
| S8 | Video assembly | 06, 08 | Image duration vs audio length; alternating zoom-out → zoom-in → cut → zoom-out pattern rules; intro/outro card durations and text; 9:16 rendering |
| S9 | Pipeline lifecycle | 07, 08 | Stage order and status transitions; progress a stage reports; failure handling (retry, resume from stage, restart) and what a failed stage shows; project-level status derivation |
| S10 | Re-runs and edits | 08 | Effect of an article edit or a stage re-run on downstream outputs (invalidate, keep, cascade); regenerate-one-image against the existing video; re-render inputs |
| S11 | Cancel | 08 | Which in-flight provider calls stop; which outputs survive; project state after cancel |
| S12 | Telemetry | 01, 02, 08 | Machine ID generation and reset; counters per stage and their units; report timing (per stage vs per run); offline queueing; first-run notice trigger; counter refresh interval and unavailable state on the marketing page |
| S13 | Provider credentials and voices | 03, 06 | Key verification on save; unkeyed providers on Play (hidden, disabled, blocked); removing a key a project used; empty voice list on Play |
| S14 | Storage and downloads | 07, 08 | Where outputs live on the machine; download naming; "download all" packaging; deleting a project (and a running one) |
| S15 | Prompt management | 04, 08 | Deleting a prompt a past project used; what the project header shows afterwards |
| S16 | Thumbnail prompt written by the LLM (added by `logic` §Q35) | 06, 08 | The LLM writes the thumbnail's image prompt from the thumbnail template and the article; settled in `logic/10-thumbnail-prompt-by-llm.md` |

Every `rule: logic` marker in 01-08 names exactly one of S1-S15; S16 was added during `logic` and has no marker of its own.

## Handed to `stack`

- LLM access through OpenRouter (Q16, surfaced, not settled here).
- TTS and image-generation providers: unnamed; 03 and 06 show placeholder rows.
- Audio container for download (drawn as `.mp3` on 08).

## Assumed

Items invented to complete a wireframe; each is marked "assumed" inline and in its screen's frontmatter. Confirm or strike before `uiux` and `logic` build on them.

- 01: counter set (videos, audio hours, images, tokens, installs) stands by silence at Q27; section order.
- 02: modal presentation; dismissing lands on 03 when no key is saved.
- 03: a voice entry names its TTS provider; provider rows are placeholders; outro card fields live here; keys masked after save.
- 04: Delete and Duplicate per prompt; a slots column in the list.
- 05: live "Detected slots" line; kind chosen in the editor.
- 06: research and thumbnail have Off / Generate / Provide; video always generated; provider dropdowns list keyed providers only; model dropdowns fetched from the provider; thumbnail prompt runs once; Video title required and names the project; LLM row shown only while research or article is Generate; keyword group order.
- 07: columns title / status / format / created; Delete per project; landing screen after first run.
- 08: "provided" and "skipped" labels; header contents; "Download all" is one archive; inline article editor with Save & continue.
- Shell: nav order Projects / Play / Prompts / Settings.

## Amendments from `logic` (applied at the readback, 2026-09-02)

Relocated into this interview as §Q29-§Q31 and applied to the wireframes above; kept as the trail of what changed and where it was settled.

- Intro/outro library: a new section of its own (own nav entry, assumed) holding entries with name, category (intro/outro), mode (Text/LLM), and a `{{keyword}}` body (`logic-interview.md` §Q90, §Q91, §Q98). Not drawn.
- 06 Play: intro and outro card toggles replaced by pickers (Off / one saved entry each) (§Q91); thumbnail control reads Off / From prompt / Prompt by LLM / Provide (§Q78); audio block gains a Chunking control (Whole / Per paragraph / Every N words, default 500) (§Q65, §Q69); keyword fields are single-line inputs capped at 200 characters, laid out Common Fields on top then Article Fields | Image Fields (§Q26).
- 03 Settings: channel name and closing line removed; a "silence between segments" field in seconds, default 3, added (§Q94, §Q95, §Q99).
- 08 Project page: article stage gains sources and pronunciation-glossary files (§Q64); audio stage holds body, intro, and outro files (§Q93); intro/outro cards no longer exist, the slideshow spans the whole video (§Q94); research stage shows "k of N chapters" progress and the sent instructions (§Q54, §Q55).
- Provider dropdowns list every supported provider with unkeyed ones greyed out (§Q12), superseding 06's assumption.
- Usage page: a new screen showing this install's own all-time telemetry totals (§Q119, §Q132). Not drawn.
- 02 First-run notice: its tracked-counters list must match `logic/16-telemetry.md` steps 3-4 exactly (tokens per stage with provider and model, audio seconds, images, thumbnails, videos, projects; app version), superseding the shorter list drawn (§Q127-§Q129).
