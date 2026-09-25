## 2026-09-24 - groom: 2026-09-24-codex-image-provider
key: groom/2026-09-24-codex-image-provider@Q4

- docs/capstone/features/2026-09-24-codex-image-provider/spec.md extends the standalone Codex CLI image provider with runtime model discovery for Claude Code, Codex and Gemini CLI.
- Chosen: the installed local CLIs supply their own model choices and admission data; `models.yaml` governs API-backed providers only, and legacy local-CLI rows in private copies are ignored.
- Chosen: Codex image generation exposes one adapter-owned built-in capability, without claiming selection of an underlying image model or adding an API-key fallback.
- Rejected: hard-coded CLI model lists, token-spending discovery prompts, the noncompliant Anthropic Agent SDK dependency and stale YAML fallback after discovery failure.
- Failure behavior: retain saved model IDs, warn when discovery fails or a saved ID is unavailable, and permit manual exact-ID entry for local LLMs.
