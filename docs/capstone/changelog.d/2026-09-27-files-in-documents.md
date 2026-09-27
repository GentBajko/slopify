# Your files in Documents

- New installs keep projects, scheduled backups and exports in `<Documents>/Slopify` (Windows' Documents known folder, OneDrive included; `~/Documents` on macOS; `xdg-user-dir` on Linux). The database, settings, models and logs stay in the hidden data folder.
- Existing installs keep their folders. Settings → Backup & storage → Your files shows where they are, with Open folder, Move to Documents/Slopify and Choose another folder: every file is copied and checked by size and SHA-256 before Slopify switches, the old folder is kept, a move refuses while a project runs and continues where it stopped after an interruption.
- New Docker installs mount `<Documents>/Slopify/Projects` and `Backups`; `update --docker --projects-dir documents` moves an existing one there.
- Storage cleanup never removes loose files, hidden files or `desktop.ini` from a Projects folder outside the data folder.
