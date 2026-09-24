## 2026-09-24 - fix: host CLI admission and rebuild feedback
key: fix/host-rebuild-readiness

- Reproduced the reported 1.4.0 failure using read-only validation of the user's saved review: provider/model checks passed, but final admission incorrectly compared host paths with container-local commands. No rebuild was admitted.
- Shared the native-only path-change check between rebuild and Play admission. Host-managed Claude, Codex, Gemini and Codex Images are covered by regression tests; native path-change refusals remain covered.
- Rebuild failures now show detailed, focused feedback beside Start rather than only a generic message above the review. Pending requests have a visible label; retryable failures preserve consent and the request identity. Stale/conflicting reviews close with focused recovery feedback.
- The initial regression run failed in all eight host admission cases and both feedback cases. Focused tests passed after the correction. No provider generation was used.
- Scope: no changes to credentials, pricing, consent requirements, retry limits, project content or host helper protocol. Patch version: 1.4.1.
- Verification: 436 test files, 3368 passing tests and one platform-conditional skip; lint, strict type checks and build passed; audit reported zero vulnerabilities. A disposable 390×844 browser check confirmed consent retention, the pending label, detailed errors beside Start and automatic focus. The test page and server were removed afterward.
