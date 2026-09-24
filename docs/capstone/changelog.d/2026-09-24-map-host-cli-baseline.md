## 2026-09-24 - map: host CLI execution baseline
key: map/host-cli-baseline@1891c70d2017

- Rechecked the host-CLI portions of architecture, provider models and operations against source before designing a host execution bridge; unrelated broad chapter stamps remain historical.
- Recorded the existing Docker behavior accurately: read-only executable/model-cache mounts, CLI execution inside the container, separate HOME/login, and no host helper or transport.
- Corrected image-provider registration and dynamic CLI catalogue descriptions, plus ModelInfo.group and Readiness.issue fields.
- Added the existing Linux Docker launcher to the index module map. No new runtime behavior, service or container configuration was installed.
- Read-only host/container status checks confirmed that host Claude and Codex logins are available while their container logins are not. Only login booleans/method names were retained; credentials were not read or copied.
- Identified version-only readiness, repeated missing-login attempts, and generic Codex image error reporting as related implementation boundaries. Paid generation was not invoked.
- Fragments remain unfolded on the feature branch; pre-existing untracked fragments are untouched.
