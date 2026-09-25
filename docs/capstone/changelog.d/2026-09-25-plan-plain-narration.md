## 2026-09-25 - plan: Plain Narration

key: plan/2026-09-25-plain-narration@Q1

- Authority: design/implementation approval delegated explicitly by the user; no additional question requested or fabricated.
- File map: `packages/app/src/slices/article/plain.ts` projects transformed prose; adjacent `plain.test.ts` covers punctuation, entities, genuine backslashes, paragraphs, lines and empty non-prose content.
- Task 1: test-first direct prose projection; retain helper signature and all existing call sites.
- Coverage: five requirements and five behavior rules mapped, with no forward dependency or placeholder; full pass rechecked spec, tasks and test cases.
- Constraints: strict typing, existing dependencies, no schema/API, no blanket backslash removal, no historical rewrite, no production/provider execution; source-only commit after article/narration/rebuild tests, typecheck, lint and diff checks.
- Task 1 proves D&D no longer acquires a narration backslash while paths and literal punctuation survive. Execution follows Docker storage under the user's ordered work.
