# fix/legacy-document-retry — Slopify 1.5.1

- User requested a quick patch, publication and local Docker update; no new feature interview or full local CI rehearsal.
- `preview-retained.ts` replaces pre-document research/editor and article requests in the reviewed rebuild plan when they have no running call, accepted continuation, completed piece or cached answer. Admission creates a new invocation; old requests and attempt history remain intact.
- `preview-plan.ts` preserves the duplicate-charge warning when a reviewed replacement has a different fingerprint from a previously submitted request.
- `revision-document-upgrade.test.ts` covers failed/pending editor and article requests through the real runner with fake providers, report reuse, original attempt retention, and running/accepted/cached request preservation.
- Local verification: 52 focused test files, 289 passing tests; application typecheck and production build passed. Read-only planning against the installed project matched the scheduler fingerprint and retained all 13 reports and six images. No production generation was started.
