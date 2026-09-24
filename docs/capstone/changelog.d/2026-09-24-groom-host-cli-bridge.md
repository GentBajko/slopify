## 2026-09-24 - groom: real host CLI execution for Docker
key: groom/2026-09-24-host-cli-bridge@Q3

- Approved shape: one host-side helper managed by Slopify's existing Docker launcher, with a one-time startup/host-access confirmation; native installs remain unchanged.
- Host Claude Code, Codex and Gemini retain their existing logins. Text, research, metadata and Codex image operations run on the host; only typed results and validated image bytes cross the private connection.
- Rejected mounted-binary execution/credential copying because neither implements the requested host execution; rejected mandatory manual helper startup because it adds a recurring reboot step.
- Scoped the helper to authenticated Unix-socket operations, owned private workspaces, bounded streams, cancellation and terminal missing-login/uncertain transport errors. No arbitrary host commands or paths may be supplied by Docker.
- The dedicated helper does not re-enable the old native server. Automatic boot setup explains user lingering; data volume, prompts, settings and completed outputs remain retained.
- Fourteen requirements, twenty-one behavior rules and eight global constraints are formalized for planning. No runtime implementation, service installation, paid request, container replacement or release occurred in grooming.
