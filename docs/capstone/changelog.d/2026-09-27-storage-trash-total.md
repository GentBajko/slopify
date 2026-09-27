# Disk space shows the trash

- Settings → Backup & storage → Disk space shows deleted projects apart: for example "256 KB in the trash (2 deleted projects), freed when removed for good", and the project files figure no longer counts them. `GET /api/storage` gains `trash: {projects, bytes}`.
- The older settings-only .zip still imports and deliberately carries no channels: nothing has written one since Export everything, which already carries channels and their cast; importing one leaves the channels here untouched.
- The architecture chapter's HTTP table now lists every route, including trash, backups, channels, reviews, Studio, onboarding and the host CLI bridge.
