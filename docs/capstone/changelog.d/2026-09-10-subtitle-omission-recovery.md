## 2026-09-10 - subtitle omission recovery (unreleased)
key: subtitles/omission-recovery
- Add bounded resynchronization after short omitted transcript passages using existing local acoustic output; do not make paid requests or regenerate narration.
- Require four strong following words and cap both per-event and total omissions. Preserve rejection of wrong recordings, extra speech and weak anchors.
- Persist timestamped unmatched text in caption timing caches and export metadata; display a review note beside caption downloads. Version the timing cache for the new algorithm.
- Verification: 1,916 tests passed, one platform skip; lint, type checks and production build passed. An isolated real-audio excerpt that failed previously completed with 768 timed words and one omission note. No user project files or database were changed.
- logic/17-subtitles.md and uiux/screens/03-project.md absorb the implemented behavior.
