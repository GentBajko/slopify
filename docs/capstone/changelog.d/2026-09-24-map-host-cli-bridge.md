## 2026-09-24 - map: host CLI bridge
key: map/host-cli-bridge@9bd6517

- Scoped refresh after host execution replaced mounted container executables. Unrelated historical broad stamps and reference coverage remain unchanged; no unrelated full-map regeneration.
- `01-architecture.md`: covered host-CLI behavior changed; host composition, socket protocol and app/host ownership.
- `02-models.md`: covered host-CLI behavior changed; host status, strict protocol limits and terminal unavailable.
- `04-data-flow.md`: covered host-CLI behavior changed; host execution, cancellation and container image publication.
- `06-testing.md`: covered host-CLI behavior changed; real-socket/fake-process and packaged Docker evidence, with live-call limits.
- `07-operations.md`: covered host-CLI behavior changed; consent, install/upgrade/rollback, private paths and disable/update commands.
- `logic/02-provider-credentials.md`: covered host-CLI behavior changed; host readiness and read-only paths.
- `logic/09-image-generation.md`: covered host-CLI behavior changed; host image-byte transfer and terminal uncertain failures.
- `logic/13-cancel.md`: covered host-CLI behavior changed; per-request host cancellation, cleanup and deadline ownership.
- `logic/19-catalogue-thinking.md`: covered host-CLI behavior changed; host CLI discovery distinct from YAML API catalogues.
- `logic/20-boot-cli-recovery.md`: covered host-CLI behavior changed; one-command helper setup, lifecycle and no container fallback.
- `mockup/03-settings.md`: covered host-CLI behavior changed; read-only host commands versus editable native paths.
- `uiux/screens/08-settings.md`: covered host-CLI behavior changed; host/login/helper error states without an installer UI.
- `logic/README.md`: covered host-CLI behavior changed; updated scenario descriptions.
- `mockup/README.md`: covered host-CLI behavior changed; updated Settings scope.
- `uiux/README.md`: covered host-CLI behavior changed; updated Settings scope.
- `00-index.md`: covered host-CLI behavior changed; host helper/module entries and Settings companion rows.
- No new external repository interface, screen, design token or dependency was added; those topics were not regenerated.
- Index refreshed last; source pointers and local links checked. Existing unrelated fragments remain untouched and no branch ledger folding was performed.
