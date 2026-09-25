## 2026-09-24 - plan: 2026-09-24-codex-image-provider
key: plan/2026-09-24-codex-image-provider@Q4

- docs/capstone/features/2026-09-24-codex-image-provider/plan.md maps 11 requirements, 11 behavior rules and four global constraints to five test-first tasks.
- File map covers local CLI discovery, API-only YAML filtering, admission and execution validation, an isolated Codex ImagePort adapter, shared executable readiness, provider UI, and media-publication tests.
- Tasks: discover installed CLI models without generation; make CLI choices independent of YAML; produce one validated image from an isolated Codex child; expose Codex as a shared-path image provider; verify ordinary media publication.
- Constraints pinned: no image API fallback or new dependency, no direct project writes or leaked credentials, preserved saved IDs, code-owned local concurrency, test-first commits on a feature branch, and no docs-area commits.
