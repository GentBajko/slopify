## 2026-09-25 - groom: Plain Narration

key: groom/2026-09-25-plain-narration@Q1

- What: remove Markdown serializer escapes from spoken/readable text without removing genuine literal backslashes.
- Authority: user's explicit character-escape fix and delegated no-question execution; inherited subagent mode.
- Evidence: transformed remark/GFM/strip-markdown AST already contains correct D&D; final Markdown serialization introduces the backslash.
- Decision: direct paragraph text projection, existing removal semantics and immutable article preserved; no dependency, API, schema or historical rewrite.
- Scope: five requirements/five behavior rules with isolated tests; implementation remains ordered after Docker project storage.
