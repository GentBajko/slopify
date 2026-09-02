---
mode: prescriptive
generated_date: 2026-09-02
capstone_version: 5.2.0
paths_covered:
  - "packages/app/src/**"
  - "packages/web/src/**"
---

> Prescriptive: written from the design interview, not from code. Terms come from the mockup, logic, uiux, and architecture interviews; implementation sites are planned paths.

# Glossary

## Concepts

| Term | Meaning in Slopify | Planned implementation |
|---|---|---|
| Run, project | One press of Play: a project record with six stages and a folder of outputs; the words are used interchangeably, "project" in the UI (`mockup-interview.md §Q10`) | `slices/admission`, table `projects` |
| Stage | One of research, article, audio, images, thumbnail, video; has a source and a state (`logic/01`) | table `stages`, `kernel/runner` |
| Source | How a stage is fulfilled: Generate, Provide, Off (research, thumbnail), From prompt / Prompt by LLM (thumbnail) (`logic/05`, `logic/10`) | `stages.source` |
| State, lamp | A stage's lifecycle value (pending, running, done, failed, canceled, provided, skipped) and its rendering as a tally lamp with a state word (`logic/01`, `uiux/02-system.md`) | `stages.state`, `packages/web/src/components/lamp.tsx` |
| Piece | A resumable sub-unit of a stage: research chapter, audio chunk or segment, image index, written thumbnail prompt (`logic/06`, `08`, `09`, `10`) | table `stage_pieces` |
| Attempt | One try of a provider call under the retry policy: at most 4 per call (`logic/01` §Q4) | table `attempts`, `kernel/runner/attempt.ts` |
| Slot, keyword | A `{{name}}` placeholder in a prompt body; one field per distinct name on Play; filled once per run (`logic/03`) | `slices/admission/substitute.ts`, `prompts.slots` |
| Prompt kinds | Article, image, thumbnail templates (`mockup-interview.md §Q13`) | table `prompts` |
| Entry | An intro or outro: Text mode narrated as written, LLM mode an instruction whose answer is narrated (`logic-interview.md §Q98`) | table `entries` |
| Cue sheet | The Play screen's right column: title, format, intro, outro, LLM, keywords, Play (`uiux/screens/06-play.md`) | `packages/web/src/routes/play.tsx` |
| Rail | A full-width bordered row for a stage or a setting group, the control-room layout unit (`uiux/01-direction.md`) | `packages/web/src/components/rail.tsx` |
| Rundown | The project list and the project page's stage-by-stage view (`uiux/screens/07`, `08`) | `packages/web/src/routes/projects.tsx`, `project.tsx` |
| Tally | The "N running" count in the top bar (`uiux/03-experience.md`) | `edge/events/global.ts` |
| Going on air | The signature interaction: lamps lighting stage by stage as a run proceeds (`uiux/01-direction.md`) | SSE events + lamp component |
| Port, adapter | A behaviour-named interface per provider family (`LlmPort`, `TtsPort`, `ImagePort`) and a concrete implementation for one provider or CLI (§Q10, §Q33) | `kernel/ports/`, `adapters/` |
| Agent CLI adapter | An `LlmPort` adapter that spawns Claude Code or Codex non-interactively (§Q10) | `adapters/llm/claude-code.ts`, `codex.ts` |
| Provided output | User-supplied content for a stage, staged in the background before Play, attached at Play (`logic/05`) | `slices/storage`, table `staged_files` |
| End matter | The article's "Sources Consulted" and "Pronunciation Glossary" sections, split into files and never narrated (`logic/08` §Q63-§Q64) | `slices/narration/split.ts` |
| Narration source | The plain-text body the TTS reads (`logic/05` §Q37, `logic/07` §Q57) | output role `article_txt` |
| Chunking | Whole / Per paragraph / Every ~N words (default 500) for TTS requests (`logic/08` §Q65) | `slices/narration/chunk.ts` |
| Gap | Silence between intro, body, outro, default 3 s (`logic/11` §Q95, §Q99) | `settings` key `silenceGapSeconds` |
| Render plan | Per-image slots, zoom pattern, frame, fps computed before ffmpeg runs (`logic/11`) | `slices/video/plan.ts`, output role `render_params` |
| Interrupted | A stage found running at boot after a process death; failed with that reason (`logic/01` §Q7) | `cli.ts` boot sequence |
| Machine ID | The anonymous UUID created when the first-run notice is dismissed (`logic/16` §Q127) | table `machine` |
| Telemetry event | One locally logged, queued, deduplicated usage record (`logic/16`) | table `telemetry_events`, collector |
| Data directory | `~/.slopify` or the configured path holding the database, projects, staging, logs (`logic/14`) | `kernel/config` |
