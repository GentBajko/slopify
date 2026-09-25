## 2026-09-25 - groom: Docker project folder
key: groom/2026-09-25-docker-project-folder@Q4

- `features/2026-09-25-docker-project-folder/spec.md`: defines automatic host project storage, verified migration, retained history, private app state and truthful host folder access.
- Decision authority: the user explicitly delegated remaining decisions and requested no further questions; the selected subagent execution mode continues.
- Chosen: nested `/data/projects` bind plus private installation state; original source retained, copy verified before activation, remembered paths reused on updates.
- Rejected: whole-data exposure, duplicate export mirroring, manual bind/permission setup and a broad host desktop-command bridge.
- Out of scope: remote daemon/NAS sync, new platform launchers, paid generation in tests, and the independent escaping/Resume/stage-rerun changes.
