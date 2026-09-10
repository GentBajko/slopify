## 2026-09-10 - provider model catalogues
key: models/provider-catalogues@2026-09-10
- Request: automatically load provider model choices in Play and paused/failed project controls, with refresh and supported manual IDs.
- Backend contract: GET /api/providers/:id/models returns models, allowsCustom, optional origin notice and separate discovery warning; refresh=1 bypasses the five-minute cache. Failed loads preserve prior or bundled compatible choices. Provider origins include live APIs, installed CLI metadata/aliases and curated adapter lists.
- Frontend: removed duplicated model catalogues and sole-model defaults; added explicit TTS model selection. Provider-keyed queries avoid stale responses, preserve selected/saved IDs and retain usable choices through failures. fal and Replicate do not offer arbitrary custom IDs because model input schemas vary.
- References: logic/02-provider-credentials.md, mockup/06-play.md, 01-architecture.md, 02-models.md, 05-dependencies.md and 06-testing.md.
- Verification: 1,761 tests passed with one Windows-only skip; lint, strict type checking and production build passed. A real browser verified installed Codex/Gemini choices, custom IDs, refresh, saved selection and no page errors. Follow-up tutorial tests passed after the copy update.
