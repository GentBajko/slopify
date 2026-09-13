## 2026-09-12 - groom: 2026-09-10-play-redesign-drafts
key: groom/2026-09-10-play-redesign-drafts@Q5

- `features/2026-09-10-play-redesign-drafts/spec.md`: formalized approved Play composition, durable draft/upload ownership, full-page review, and replay-safe Start requirements.
- Chosen: four freely navigable Content/Outputs/Style/Review sections with one responsive preview, matching the approved clickable mockup.
- Chosen: local server SQLite drafts, 500ms idle save, explicit conflicts and retained completed staged uploads across restarts.
- Chosen: exact reviewed-input binding and durable request identity for single and batch starts; uncertain responses cannot cause duplicate chargeable admissions.
- Rejected: all-visible controls retain crowding; collapsible long form separates controls from preview; browser-only persistence does not preserve server media.
- Prototype browser storage, illustrative model prices and simulated Start are demonstration mechanics, not production contracts.
- Deferred: checkpoints, templates, schedules/background, broader reliability/preflight, portability/storage and final release acceptance remain separate required release groups.
- Out of scope: website changes, release publication, version bump and automatic docs commits.
