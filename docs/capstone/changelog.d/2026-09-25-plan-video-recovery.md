## 2026-09-25 - plan: Video Recovery Implementation Plan

key: plan/2026-09-25-video-recovery@Q3

- Approved two source-only tasks: preserve planning context through local export admission, then retry interrupted subtitle-model transfers.
- File map: rebuild `service.ts`, `admission-repo.ts`, `service-reuse.test.ts`; alignment `cache.ts` and new `cache-retry.test.ts`.
- Pin strict typing, no new dependencies, exact request/revision authority, retained completed outputs, bounded abortable retry, private checksum-verified publication and isolated fake-provider verification.
- Use `codex/video-recovery`. No production restart, regeneration, release or broad stored-context rewrite is part of implementation verification.
