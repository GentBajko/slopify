## 2026-09-24 - groom: 2026-09-24-codex-image-provider
key: groom/2026-09-24-codex-image-provider@Q2

- docs/capstone/features/2026-09-24-codex-image-provider/spec.md defines a standalone Codex CLI image provider for slideshow and thumbnail work using the existing ImagePort and publication path.
- Chosen: explicit image-provider selection, independent of the text provider; the existing Codex login and executable path are reused.
- Rejected: coupling images to the text provider or switching to Codex as an automatic fallback; both would override an independent image choice.
- Rejected: direct writes into project folders or an API-billed image fallback; project ownership stays with Slopify and the local CLI path remains distinct.
- Open validation: a noninteractive local Codex CLI run must produce an image at a deterministic private path before implementation proceeds.
