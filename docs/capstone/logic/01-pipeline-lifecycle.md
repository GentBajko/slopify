---
scenario: pipeline-lifecycle
mockup_row: S9
screens: [07-projects, 08-project]
depends_on: []
cited_by_forward: [04-run-admission, 12-reruns-and-edits, 13-cancel, 16-telemetry]
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# 01 Pipeline lifecycle

The spine every other scenario hangs on: which stages run in what order, what a stage's status means, and what happens when a call fails or the process dies.

## Trigger & preconditions

- Trigger: a run accepted by scenario 04 `run-admission` (Play on `mockup/06-play.md`); one play creates one project.
- Precondition: the project record exists with its run configuration: per-stage source (Generate / Provide / Off), prompts, keyword values, providers, models, voice, format, card toggles, title.
- Actor: the single local user; there are no roles.

## Steps

1. Mark stages at creation: every stage with source Provide → `provided`, with its supplied output attached; research or thumbnail with source Off → `skipped`; every other stage → `pending`.
2. Start research if pending. Progress signal: "k of N chapters researched" (scenario 06, superseding the plain `running`).
3. Start article when research is `done`, `provided`, or `skipped`. Progress: text streamed into the page as it arrives. The article stage also writes the text of any LLM-mode intro or outro entry picked for the run, after the article (scenario 07).
4. When article is `done` or `provided`, start audio, images, and thumbnail together, each independently. Progress: images appear one by one, k of N; audio streams when the provider streams, otherwise appears on completion. The audio stage narrates the body and the picked intro and outro (scenario 08).
5. Start video when audio, images, and thumbnail are each `done`, `provided`, or `skipped`. Progress: render percentage. Video is always generated (mockup `06-play.md`, assumed there).
6. A stage's provider call is attempted up to 4 times: the first attempt plus 3 retries, waiting 2 s, 8 s, 30 s between attempts; a 429 response waits the provider's Retry-After instead when one is given; each attempt times out at 120 s, measured between streamed chunks for a streaming call and over the whole call otherwise, except image-generation calls, which time out at 300 s; the video render has no timeout.
7. Project status is derived, never stored independently: `running` if any stage is `running`; else `canceled` if any stage is `canceled` (scenario 13); else `failed` if any stage is `failed`; else `done` if video is `done`.

## Branches

- Source per stage decides step 1: Provide vs Generate vs Off (Off exists only for research and thumbnail).
- Dependencies satisfied by `provided` or `skipped` exactly as by `done`.
- Retry-After present on a 429 → it replaces the fixed backoff for that wait.
- Number of parallel projects: unlimited; no queue, no `queued` status.

## Unhappy paths

- Attempts exhausted (4 failures): stage → `failed`; the stage on `mockup/08-project.md` shows the provider's error text verbatim and the attempt count. Siblings keep running; outputs of `done` stages are kept.
- Manual retry on a `failed` stage: the stage re-runs from scratch with a fresh attempt budget; on success every `pending` dependent proceeds automatically; independent stages are untouched.
- Process dies mid-run (terminal closed, machine asleep): on next app start every stage found `running` → `failed` with reason "interrupted"; the project reads `failed` and waits for manual retry; nothing auto-resumes.
- Parallel projects hitting one provider's rate limit: absorbed by the retry policy in step 6; no cross-project coordination.
- Cancellation mid-run: scenario 13.
- Abandonment: a `failed` project stays `failed` indefinitely; nothing expires.

## State transitions

Stage states: `pending`, `running`, `done`, `failed`, `canceled`, `provided`, `skipped`.

| From | To | When |
|---|---|---|
| (new) | pending / provided / skipped | step 1 |
| pending | running | dependencies satisfied |
| running | done | provider output stored |
| running | failed | attempts exhausted, or interrupted at app start |
| failed | running | manual retry |
| running | canceled | user cancel (scenario 13) |
| canceled | running | manual retry, resuming like failed (scenario 13) |
| done | running | re-run, scenario 11 only |

Forbidden: `provided` → `running`, `skipped` → `running`, any state → `pending`.

Project states: `running`, `failed`, `done`, `canceled` (`canceled` per scenario 13).

## Invariants

- Video never starts before audio, images, and thumbnail are each `done`, `provided`, or `skipped`.
- A stage holds exactly one state at any time.
- No provider call is attempted more than 4 times without a human retry.
- A project with any `failed` stage never reads `done`.
- A failure in one stage never discards another stage's `done` output.

## Outcomes & side effects

- Success: video `done`, project `done`; every stage's output available on `mockup/08-project.md` and for download (scenario 13 owns storage).
- Failure: a `failed` stage with its error text and attempt count, project `failed`, awaiting manual retry.
- Record: per stage, status, attempt count, last error text, and timestamps of each transition are persisted with the project (storage layout is scenario 13's).
- Telemetry counters increment per stage per scenario 15; nothing else fans out.
- Nobody is notified; the page reflects status changes.

## Dimensions not in play

- D1 authority: one local actor, no roles, no delegation.
- D3 input: run inputs are validated by scenarios 03, 04, and 05 before this scenario starts.
- D5 money: no charge, credit, or balance moves inside the app; provider spend happens on the user's own keys outside it.
- D13 notification: no channel exists; the UI updates in place.
- D7 time beyond timeouts and backoff: nothing expires or is scheduled.
