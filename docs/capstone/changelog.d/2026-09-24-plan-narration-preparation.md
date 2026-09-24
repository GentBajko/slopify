## 2026-09-24 - plan: 2026-09-24-narration-preparation
key: plan/2026-09-24-narration-preparation@Q3

- `features/2026-09-24-narration-preparation/plan.md`: approved eight-task inline implementation plan covering all 11 requirements and 12 behavior rules.
- Task 1: validate source-bound cue annotations with unchanged sentence text.
- Task 2: render persistent instructions into bounded physical TTS requests.
- Task 3: extend prompt storage, admission, drafts, templates and preserving migration.
- Task 4: execute preparation through revision-owned Audio LLM work and estimate both initial and rebuild costs.
- Task 5: publish separate clean narration and TTS scripts with clean caption input.
- Task 6: expose optional preparation and scoped text downloads in Audio.
- Task 7: verify complete execution, recovery, upgrades and UI; absorb affected references.
- Task 8: bump, publish and verify npm, GitHub and multi-architecture GHCR artifacts.
- File map: narration pure functions; library/admission/drafts/templates; revision recipes/runtime; storage roles; Play/project/prompt UI; migration and regression tests; affected reference chapters and release metadata.
- Constraints: Off preserves old identities; Inworld TTS-2 only; existing prompts remain untouched; no paid smoke calls or automatic production-container redeployment.
- Constraints: strict structural TypeScript, existing dependencies and attempt wrapper, exact-path commits preserving unrelated files, full CI verification before publication.
