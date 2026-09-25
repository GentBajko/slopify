## 2026-09-25 - plan: 2026-09-25-glossary-pronunciation
key: plan/2026-09-25-glossary-pronunciation@Q3

- `features/2026-09-25-glossary-pronunciation/plan.md`: user approved five test-first tasks covering 9 requirements, 12 behavior rules and 6 global constraints.
- Task 1: parse supplied glossary IPA and calculate whole-term source spans in `slices/narration/pronunciation.ts`.
- Task 2: preserve IPA and Unicode atoms in paired requests through `slices/narration/steering.ts`.
- Task 3: persist the optional audio preference through admission, drafts, templates, schedules and portable transfer.
- Task 4: integrate glossary gates, exact requests, clean transcripts, local text files and revision reuse in rebuild recipes/runtime.
- Task 5: expose the independent Audio control in Play and project editing with fresh-only defaults and saved-choice retention.
- Constraints: existing libraries and strict types; no migration or widened provider port; no pronunciation LLM call; old/off request identity preserved.
- Verification: isolated fake-provider/file/SQLite and UI tests, typecheck, lint and build; source-only task commits on a codex/ branch.
- Excluded from verification: production generation, restart, Docker changes, release and paid calls.
