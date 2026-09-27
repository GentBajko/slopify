# Run cost and plan limits through the Docker host bridge

- The host CLI bridge now carries cached input tokens, the answering model and the plan windows (Claude's `rate_limit_event`, Codex's `account/rateLimits/read`) on the `done` frame, so Run cost and the plan-limit share work in Docker like they do natively.
- The helper now asks the host's Codex for its plan windows before and after each Codex text and image call, as the app does without Docker.
- Codex images report their tokens and plan windows in an `x-slopify-image-report` response header.
- Backward compatible both ways: the app asks with `x-slopify-frames: 2` and the helper only sends the new fields when asked (older apps read frames strictly); the app reads frames leniently and treats missing fields as "not reported". The health protocol stays 1. Documented in `docs/docker.md`.
